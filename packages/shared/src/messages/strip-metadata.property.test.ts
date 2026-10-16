import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { stripMetadata, UnreadableImage } from './strip-metadata'

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const MAGIC: Record<(typeof TYPES)[number], number[]> = {
  'image/jpeg': [0xff, 0xd8],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  'image/gif': [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
}

const bytes = fc.uint8Array({ maxLength: 512 })
/** Random bytes behind a real signature: deeper into each parser than pure noise gets. */
const signed = fc
  .tuple(fc.constantFrom(...TYPES), bytes)
  .map(([type, tail]) => [type, Uint8Array.from([...(MAGIC[type] ?? []), ...tail])] as const)

/** The only outcomes allowed: nothing to strip, a stripped copy, or a clear refusal. */
const strip = (data: Uint8Array, type: string) => {
  try {
    return stripMetadata(data, type)
  } catch (error) {
    expect(error).toBeInstanceOf(UnreadableImage)
    return undefined
  }
}

describe('stripMetadata, for any bytes', () => {
  it('returns null, a copy no longer than the input, or throws UnreadableImage', () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), bytes, (type, data) => {
        const result = strip(data, type)
        if (result instanceof Uint8Array) expect(result.length).toBeLessThanOrEqual(data.length)
      }),
      { numRuns: 500 },
    )
  })

  it('keeps the file signature when it strips something', () => {
    fc.assert(
      fc.property(signed, ([type, data]) => {
        const result = strip(data, type)
        if (result instanceof Uint8Array) {
          const magic = MAGIC[type]
          expect([...result.subarray(0, 4)]).toEqual([...data.subarray(0, 4)])
          expect(result.length).toBeGreaterThanOrEqual(Math.min(magic.length, data.length))
        }
      }),
      { numRuns: 500 },
    )
  })

  it('has nothing left to strip the second time', () => {
    fc.assert(
      fc.property(signed, ([type, data]) => {
        const once = strip(data, type)
        if (!(once instanceof Uint8Array)) return
        const twice = strip(once, type)
        expect(twice === null || twice === undefined || twice instanceof Uint8Array).toBe(true)
        if (twice instanceof Uint8Array) expect([...twice]).toEqual([...once])
      }),
      { numRuns: 300 },
    )
  })

  it('leaves formats it does not handle alone', () => {
    fc.assert(
      fc.property(
        fc.string().filter((type) => !TYPES.includes(type as (typeof TYPES)[number])),
        bytes,
        (type, data) => {
          expect(stripMetadata(data, type)).toBeNull()
        },
      ),
    )
  })
})
