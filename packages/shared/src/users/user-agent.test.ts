import { describe, expect, it } from 'vitest'

import { describeUserAgent } from './user-agent'

describe('describeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome · macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge · Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', 'Firefox · Linux'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/120.0.0.0',
      'Opera · Windows',
    ],
    ['Chinchi Desktop/1.0', 'Chinchi Desktop'],
    ['curl/8.7.1', 'curl'],
  ])('describes %s', (userAgent, expected) => {
    expect(describeUserAgent(userAgent)).toBe(expected)
  })

  it.each([null, '', '   '])('returns null for %j', (userAgent) => {
    expect(describeUserAgent(userAgent)).toBeNull()
  })
})
