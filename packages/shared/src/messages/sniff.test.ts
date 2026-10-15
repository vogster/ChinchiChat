import { describe, expect, it } from 'vitest'

import { SNIFF_BYTES, detectImageType } from './sniff'

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((char) => char.charCodeAt(0)) : [value],
    ),
  )

describe('detectImageType', () => {
  it.each([
    ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF')],
    ['image/gif', bytes('GIF89a', 1, 0)],
    ['image/gif', bytes('GIF87a', 1, 0)],
    ['image/webp', bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ')],
  ])('recognizes %s', (type, input) => {
    expect(detectImageType(input)).toBe(type)
  })

  it.each([
    ['empty', bytes()],
    ['html', bytes('<!doctype html>')],
    ['svg', bytes('<svg xmlns=')],
    ['truncated png', bytes(0x89, 'PNG')],
    ['riff that is not webp', bytes('RIFF', 0x24, 0, 0, 0, 'WAVEfmt ')],
  ])('rejects %s', (_name, input) => {
    expect(detectImageType(input)).toBeNull()
  })

  it('needs only the first few bytes', () => {
    expect(SNIFF_BYTES).toBeGreaterThanOrEqual(12)
  })
})
