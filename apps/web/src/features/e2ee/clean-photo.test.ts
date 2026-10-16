import { describe, expect, it } from 'vitest'

import { withoutMetadata } from './clean-photo'

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  )
const be16 = (n: number) => [n >> 8, n & 0xff]
const segment = (marker: number, payload: Uint8Array) =>
  bytes([0xff, marker], be16(payload.length + 2), [...payload])
const text = async (file: File) => String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))

describe('photos before encryption', () => {
  it('lose their metadata (comments, location) but keep the picture', async () => {
    const photo = bytes(
      [0xff, 0xd8],
      [...segment(0xfe, bytes('taken at home, 55.75 37.61'))],
      [0xff, 0xda],
      be16(4),
      [1, 2],
      'SCANDATA',
      [0xff, 0xd9],
    )
    const file = new File([photo], 'кот.jpg', { type: 'image/jpeg' })

    const cleaned = await withoutMetadata(file)

    expect(cleaned.name).toBe('кот.jpg')
    expect(cleaned.type).toBe('image/jpeg')
    expect(await text(cleaned)).not.toContain('taken at home')
    expect(await text(cleaned)).toContain('SCANDATA')
  })

  it('leave everything else as it is', async () => {
    const doc = new File(['отчёт без метаданных'], 'отчёт.txt', { type: 'text/plain' })
    const broken = new File([bytes([0xff, 0xd8], [0xff, 0xe1], [0xff])], 'битый.jpg', {
      type: 'image/jpeg',
    })

    expect(await withoutMetadata(doc)).toBe(doc)
    expect(await withoutMetadata(broken)).toBe(broken)
  })
})
