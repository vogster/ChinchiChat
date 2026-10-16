import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createSafeFetcher } from './safe-fetch'

import type { Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

let server: Server
let base: string

const routes: Record<string, (res: ServerResponse) => void> = {
  '/page': (res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<html><head><title>Hello</title></head></html>')
  },
  '/big': (res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('x'.repeat(10_000))
  },
  '/json': (res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{}')
  },
  '/redirect': (res) => {
    res.writeHead(302, { location: '/page' })
    res.end()
  },
  '/loop': (res) => {
    res.writeHead(302, { location: '/loop' })
    res.end()
  },
  '/to-file': (res) => {
    res.writeHead(302, { location: 'file:///etc/passwd' })
    res.end()
  },
  '/slow': (res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('late')
    }, 2_000)
  },
  '/missing': (res) => {
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('nope')
  },
}

beforeAll(async () => {
  server = createServer((req, res) => (routes[req.url ?? ''] ?? routes['/missing'])?.(res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const html = (type: string) => type.startsWith('text/html')

/** Allows the local test server; production keeps the defaults (public IPs, ports 80/443). */
const local = (overrides = {}) =>
  createSafeFetcher({
    accept: html,
    isAllowedAddress: () => true,
    isAllowedPort: () => true,
    ...overrides,
  })

describe('createSafeFetcher', () => {
  it('fetches an HTML page', async () => {
    const result = await local()(`${base}/page`)
    expect(result).toMatchObject({
      url: `${base}/page`,
      contentType: expect.stringMatching(/^text\/html/),
    })
    expect(new TextDecoder().decode(result?.body)).toContain('<title>Hello</title>')
  })

  it('follows a few redirects, re-checking each hop', async () => {
    expect((await local()(`${base}/redirect`))?.url).toBe(`${base}/page`)
    expect(await local()(`${base}/loop`)).toBeNull()
    expect(await local()(`${base}/to-file`)).toBeNull()
  })

  it('reads at most maxBytes', async () => {
    const result = await local({ maxBytes: 1_000 })(`${base}/big`)
    expect(result?.body.byteLength).toBe(1_000)
  })

  it('skips content it does not want, errors and slow servers', async () => {
    expect(await local()(`${base}/json`)).toBeNull()
    expect(await local()(`${base}/missing`)).toBeNull()
    expect(await local({ timeoutMs: 300 })(`${base}/slow`)).toBeNull()
  })

  it('refuses hostnames that resolve to private addresses, even on an allowed port', async () => {
    // Only the port rule is relaxed: the address check runs on what DNS returns.
    const strictAddresses = createSafeFetcher({ accept: html, isAllowedPort: () => true })
    const port = new URL(base).port
    expect(await strictAddresses(`http://localhost:${port}/page`)).toBeNull()
    expect(await strictAddresses(`http://127.0.0.1:${port}/page`)).toBeNull()
    // Sanity check: the same server is reachable when addresses are allowed.
    expect(await local()(`http://localhost:${port}/page`)).not.toBeNull()
  })

  describe('with production rules', () => {
    const strict = createSafeFetcher({ accept: html })

    it.each([
      ['a loopback address', () => `${base}/page`],
      ['localhost', () => `${base.replace('127.0.0.1', 'localhost')}/page`],
      ['an IPv6 loopback literal', () => 'http://[::1]/page'],
      ['cloud metadata', () => 'http://169.254.169.254/latest/meta-data/'],
      ['a non-web port', () => 'http://93.184.216.34:22/'],
      ['credentials in the URL', () => 'http://user:pass@93.184.216.34/'],
      ['another scheme', () => 'file:///etc/passwd'],
    ])('refuses %s', async (_case, url) => {
      expect(await strict(url())).toBeNull()
    })
  })
})
