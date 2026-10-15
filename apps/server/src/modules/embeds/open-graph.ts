import { Parser } from 'htmlparser2'

export interface OpenGraph {
  readonly title: string | null
  readonly description: string | null
  readonly siteName: string | null
  /** Absolute http(s) URL of the preview image, before it is fetched and stored. */
  readonly imageUrl: string | null
}

const LIMITS = { title: 256, description: 350, siteName: 100 } as const

const clean = (value: string | undefined, max: number): string | null => {
  const text = value?.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

const absoluteHttpUrl = (value: string | undefined, base: string): string | null => {
  if (!value) return null
  try {
    const url = new URL(value.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** The page text, in the charset the server or the page declares (UTF-8 otherwise). */
export const decodeHtml = (body: Uint8Array, contentType: string): string => {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(
      new TextDecoder('latin1').decode(body.subarray(0, 2048)),
    )?.[1]
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

/** Title, description, site and image of a page, from OpenGraph, Twitter cards or plain HTML. */
export const parseOpenGraph = (html: string, pageUrl: string): OpenGraph | null => {
  const meta = new Map<string, string>()
  let title = ''
  let inTitle = false
  let done = false

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (done) return
        if (name === 'title') inTitle = true
        if (name !== 'meta') return
        const key = (attributes.property ?? attributes.name ?? '').toLowerCase()
        if (key && attributes.content !== undefined && !meta.has(key)) {
          meta.set(key, attributes.content)
        }
      },
      ontext(text) {
        if (inTitle && !done) title += text
      },
      onclosetag(name) {
        if (name === 'title') inTitle = false
        // Everything we need lives in <head>.
        if (name === 'head') done = true
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  )
  parser.write(html)
  parser.end()

  const result: OpenGraph = {
    title: clean(meta.get('og:title') ?? meta.get('twitter:title') ?? title, LIMITS.title),
    description: clean(
      meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
      LIMITS.description,
    ),
    siteName: clean(meta.get('og:site_name'), LIMITS.siteName),
    imageUrl: absoluteHttpUrl(meta.get('og:image') ?? meta.get('twitter:image'), pageUrl),
  }
  return result.title || result.description ? result : null
}
