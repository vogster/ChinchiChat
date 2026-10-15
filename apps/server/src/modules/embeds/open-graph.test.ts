import { describe, expect, it } from 'vitest'

import { decodeHtml, parseOpenGraph } from './open-graph'

const PAGE = 'https://example.com/articles/42'

describe('parseOpenGraph', () => {
  it('reads OpenGraph tags', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A &amp; B">
      <meta property="og:description" content="What happened">
      <meta property="og:site_name" content="Example News">
      <meta property="og:image" content="/img/cover.png">
      <title>Fallback</title>
    </head><body>ignored</body></html>`

    expect(parseOpenGraph(html, PAGE)).toEqual({
      title: 'A & B',
      description: 'What happened',
      siteName: 'Example News',
      imageUrl: 'https://example.com/img/cover.png',
    })
  })

  it('falls back to Twitter cards, <title> and the meta description', () => {
    const html = `<head><title> Plain page </title>
      <meta name="description" content="Short summary">
      <meta name="twitter:image" content="https://cdn.example.com/x.jpg"></head>`

    expect(parseOpenGraph(html, PAGE)).toEqual({
      title: 'Plain page',
      description: 'Short summary',
      siteName: null,
      imageUrl: 'https://cdn.example.com/x.jpg',
    })
  })

  it('drops images that are not http(s) and trims long text', () => {
    const html = `<head>
      <meta property="og:title" content="${'t'.repeat(500)}">
      <meta property="og:description" content="${'d'.repeat(1000)}">
      <meta property="og:image" content="javascript:alert(1)"></head>`

    const result = parseOpenGraph(html, PAGE)
    expect(result?.imageUrl).toBeNull()
    expect(result?.title).toHaveLength(256)
    expect(result?.description?.length).toBeLessThanOrEqual(350)
  })

  it('returns null when there is nothing to show', () => {
    expect(parseOpenGraph('<html><body>just text</body></html>', PAGE)).toBeNull()
  })
})

describe('decodeHtml', () => {
  it('uses the charset from the Content-Type, then from <meta charset>, then UTF-8', () => {
    const cp1251 = Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]) // «Привет»
    expect(decodeHtml(cp1251, 'text/html; charset=windows-1251')).toBe('Привет')
    const withMeta = new TextEncoder().encode('<meta charset="utf-8"><title>Ок</title>')
    expect(decodeHtml(withMeta, 'text/html')).toContain('Ок')
    expect(decodeHtml(cp1251, 'text/html; charset=nonsense')).toBeTypeOf('string')
  })
})
