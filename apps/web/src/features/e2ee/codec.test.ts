import { describe, expect, it } from 'vitest'

import { decodePayload, encodePayload } from './codec'

const file = {
  id: '900',
  name: 'отчёт.pdf',
  type: 'application/pdf',
  size: 1234,
  key: 'a2V5',
  iv: 'aXY=',
}
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

describe('encrypted payload', () => {
  it('carries text and the secrets of its files', () => {
    const payload = { v: 1 as const, text: 'Смотри', files: [file] }

    expect(decodePayload(encodePayload(payload))).toEqual(payload)
    expect(decodePayload(encodePayload({ v: 1, text: 'Без файлов' }))).toEqual({
      v: 1,
      text: 'Без файлов',
    })
  })

  it('pads every payload to a multiple of 256 bytes, so the ciphertext hides the length', () => {
    const sizes = ['', 'Да', 'x'.repeat(200), 'ы'.repeat(300), 'z'.repeat(5000)].map(
      (text) => encodePayload({ v: 1, text }).byteLength,
    )

    for (const size of sizes) expect(size % 256).toBe(0)
    // Short messages all look the same size; a long one grows only in whole blocks.
    expect(new Set(sizes.slice(0, 2)).size).toBe(1)
    expect(sizes[4]).toBeGreaterThanOrEqual(5000)
    const padded = { v: 1 as const, text: 'Смотри', files: [file] }
    expect(decodePayload(encodePayload(padded))).toEqual(padded)
    // What was written before padding existed still reads.
    expect(decodePayload(encode({ v: 1, text: 'старое' }))).toEqual({ v: 1, text: 'старое' })
  })

  it('takes a file name from the sender only as a plain name, never a path', () => {
    const payload = {
      v: 1,
      text: '',
      files: [
        {
          ...file,
          name: '..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\update.bat',
        },
      ],
    }

    expect(decodePayload(encode(payload))?.files?.[0]?.name).toBe('update.bat')
    expect(
      decodePayload(encode({ ...payload, files: [{ ...file, name: 'invoice\u202Efdp.exe' }] }))
        ?.files?.[0]?.name,
    ).toBe('invoicefdp.exe')
  })

  it('reads nothing it does not understand', () => {
    expect(decodePayload(encode({ v: 2, text: 'из будущего' }))).toBeNull()
    expect(decodePayload(new TextEncoder().encode('не json'))).toBeNull()
    expect(decodePayload(encode({ v: 1, text: 'x', files: [{ ...file, size: 'big' }] }))).toBeNull()
    expect(decodePayload(encode({ v: 1, text: 'x', files: 'nope' }))).toBeNull()
  })
})
