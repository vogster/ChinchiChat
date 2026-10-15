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

  it('reads nothing it does not understand', () => {
    expect(decodePayload(encode({ v: 2, text: 'из будущего' }))).toBeNull()
    expect(decodePayload(new TextEncoder().encode('не json'))).toBeNull()
    expect(decodePayload(encode({ v: 1, text: 'x', files: [{ ...file, size: 'big' }] }))).toBeNull()
    expect(decodePayload(encode({ v: 1, text: 'x', files: 'nope' }))).toBeNull()
  })
})
