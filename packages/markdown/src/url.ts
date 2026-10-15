// Invisible format characters (bidi overrides, zero-width spaces) end a URL: they can make the
// shown text differ from where the link goes.
const BRACKETED = /<(https?:\/\/[^\s<>\p{Cf}]+)>/iuy
const BARE = /https?:\/\/[^\s<>\p{Cf}]+/iuy
/** Sentence punctuation (and closing spoiler bars) right after a URL are not part of it. */
const TRAILING = new Set(['.', ',', ':', ';', '!', '?', '"', "'", '|'])

export interface UrlMatch {
  readonly url: string
  readonly length: number
  readonly suppressEmbed: boolean
}

/**
 * Only absolute http(s) URLs with a host and no credentials: never `javascript:`, `data:`,
 * relative links, or `https://bank.com@evil.com`, which shows one host and opens another.
 */
export const isSafeUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0 &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

/** Drops trailing punctuation and closing parentheses that the URL did not open. */
const trimEnd = (url: string): string => {
  let end = url.length
  let open = 0
  let close = 0
  for (const char of url) {
    if (char === '(') open += 1
    else if (char === ')') close += 1
  }
  while (end > 0) {
    const char = url[end - 1] as string
    if (TRAILING.has(char)) {
      end -= 1
    } else if (char === ')' && close > open) {
      end -= 1
      close -= 1
    } else {
      break
    }
  }
  return url.slice(0, end)
}

/** An http(s) link starting at `index`, bare or as `<url>` (which asks for no preview). */
export const readUrl = (source: string, index: number): UrlMatch | null => {
  BRACKETED.lastIndex = index
  const bracketed = BRACKETED.exec(source)
  if (bracketed) {
    const url = bracketed[1] as string
    return isSafeUrl(url) ? { url, length: bracketed[0].length, suppressEmbed: true } : null
  }
  BARE.lastIndex = index
  const bare = BARE.exec(source)
  if (!bare) return null
  const url = trimEnd(bare[0])
  return isSafeUrl(url) ? { url, length: url.length, suppressEmbed: false } : null
}
