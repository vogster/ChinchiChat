import { lookup as dnsLookup } from 'node:dns'
import { isIP } from 'node:net'

import { Agent, request } from 'undici'

import { isPublicAddress } from './ip-policy'

import type { LookupAddress, LookupAllOptions, LookupOneOptions } from 'node:dns'

export interface SafeFetchOptions {
  /** Which responses to read, by their Content-Type. */
  readonly accept: (contentType: string) => boolean
  readonly maxBytes?: number
  readonly timeoutMs?: number
  readonly maxRedirects?: number
  readonly userAgent?: string
  /** Overridable for tests only; production allows public unicast addresses. */
  readonly isAllowedAddress?: (ip: string) => boolean
  /** Overridable for tests only; production allows the web ports 80 and 443. */
  readonly isAllowedPort?: (port: number) => boolean
}

export interface SafeFetchResult {
  /** Where the content finally came from, after redirects. */
  readonly url: string
  readonly contentType: string
  readonly body: Uint8Array
}

const WEB_PORTS = new Set([80, 443])

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void

/**
 * Resolves like dns.lookup, but fails if any address is not allowed. The socket connects to
 * what this returns, so a hostname cannot pass the check and then resolve elsewhere (rebinding).
 */
const guardedLookup =
  (isAllowed: (ip: string) => boolean) =>
  (hostname: string, options: LookupOneOptions | LookupAllOptions, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, [])
      const list = addresses as LookupAddress[]
      if (list.length === 0 || list.some((entry) => !isAllowed(entry.address))) {
        const refused = Object.assign(new Error(`Refusing to connect to ${hostname}`), {
          code: 'ERR_ADDRESS_NOT_ALLOWED',
        })
        return callback(refused, [])
      }
      if ((options as LookupAllOptions).all) return callback(null, list)
      const [first] = list as [LookupAddress]
      return callback(null, first.address, first.family)
    })
  }

/** Only absolute http(s) URLs, without credentials, to allowed ports and literal IPs. */
const checkUrl = (
  value: string,
  isAllowedAddress: (ip: string) => boolean,
  isAllowedPort: (port: number) => boolean,
): URL | null => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!isAllowedPort(port)) return null
  // Literal IPs never go through DNS, so check them here.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1')
  if (isIP(host) && !isAllowedAddress(host)) return null
  return url
}

const readLimited = async (
  body: AsyncIterable<Uint8Array> & { destroy: () => void },
  max: number,
) => {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of body) {
    const room = max - size
    chunks.push(chunk.byteLength > room ? chunk.subarray(0, room) : chunk)
    size += Math.min(chunk.byteLength, room)
    if (size >= max) {
      body.destroy()
      break
    }
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

/**
 * Fetches a URL a user put in a message without letting it reach the server's own network:
 * every hop is checked (scheme, port, address after DNS), redirects are followed by hand, and
 * time and size are bounded. Resolves to null for anything refused or failed.
 */
export const createSafeFetcher = ({
  accept,
  maxBytes = 1024 * 1024,
  timeoutMs = 5_000,
  maxRedirects = 3,
  userAgent = 'ChinchiBot/1.0 (link previews)',
  isAllowedAddress = isPublicAddress,
  isAllowedPort = (port) => WEB_PORTS.has(port),
}: SafeFetchOptions) => {
  const agent = new Agent({
    connect: { lookup: guardedLookup(isAllowedAddress), timeout: timeoutMs },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    // HTTP/1.1 only: less parser surface against servers chosen by whoever posts a link.
    allowH2: false,
  })

  return async (start: string): Promise<SafeFetchResult | null> => {
    const signal = AbortSignal.timeout(timeoutMs * 2)
    let current = start
    try {
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        const url = checkUrl(current, isAllowedAddress, isAllowedPort)
        if (!url) return null
        const response = await request(url, {
          dispatcher: agent,
          method: 'GET',
          signal,
          headers: { 'user-agent': userAgent, accept: 'text/html,image/*;q=0.8' },
        })
        const location = response.headers.location
        if (response.statusCode >= 300 && response.statusCode < 400 && location) {
          await response.body.dump()
          current = new URL(String(location), url).toString()
          continue
        }
        const contentType = String(response.headers['content-type'] ?? '').toLowerCase()
        if (response.statusCode !== 200 || !accept(contentType)) {
          await response.body.dump()
          return null
        }
        return {
          url: url.toString(),
          contentType,
          body: await readLimited(response.body, maxBytes),
        }
      }
      return null
    } catch {
      return null
    }
  }
}

export type SafeFetcher = ReturnType<typeof createSafeFetcher>
