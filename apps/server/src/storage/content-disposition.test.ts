import { describe, expect, it } from 'vitest'

import { contentDisposition } from './content-disposition'

describe('contentDisposition', () => {
  it('quotes plain ASCII names', () => {
    expect(contentDisposition('report.pdf', false)).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    )
  })

  it('shows inline content inline', () => {
    expect(contentDisposition('cat.png', true)).toMatch(/^inline; /)
  })

  it('replaces non-ASCII and quoting characters in the fallback, keeps them encoded', () => {
    expect(contentDisposition('кот "мур".png', false)).toBe(
      `attachment; filename="_ _.png"; filename*=UTF-8''%D0%BA%D0%BE%D1%82%20%22%D0%BC%D1%83%D1%80%22.png`,
    )
  })

  it('percent-encodes characters that encodeURIComponent leaves alone', () => {
    expect(contentDisposition("it's (1)*.txt", false)).toContain(
      `filename*=UTF-8''it%27s%20%281%29%2A.txt`,
    )
  })
})
