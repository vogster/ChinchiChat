import { describe, expect, it } from 'vitest'

import { detectAudioType, detectImageType, SNIFF_BYTES } from './sniff'

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

describe('detectAudioType', () => {
  it.each([
    ['audio/webm', bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1)],
    ['audio/ogg', bytes('OggS', 0, 2, 0, 0)],
    ['audio/mp4', bytes(0, 0, 0, 0x20, 'ftypM4A ', 0, 0, 0, 0)],
    ['audio/mp4', bytes(0, 0, 0, 0x1c, 'ftypisom', 0, 0, 2, 0)],
  ])('recognizes %s', (type, input) => {
    expect(detectAudioType(input)).toBe(type)
  })

  it.each([
    ['empty', bytes()],
    ['html', bytes('<!doctype html>')],
    ['png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)],
    ['truncated webm', bytes(0x1a, 0x45)],
    ['ftyp in the wrong place', bytes('ftypM4A ', 0, 0, 0, 0)],
  ])('rejects %s', (_name, input) => {
    expect(detectAudioType(input)).toBeNull()
  })
})
