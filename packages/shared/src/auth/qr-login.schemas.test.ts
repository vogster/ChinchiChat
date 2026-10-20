import { describe, expect, it } from 'vitest'

import {
  approveQrLoginRequestSchema,
  createQrLoginRequestSchema,
  qrLoginCodeSchema,
} from './qr-login.schemas'

const KEY = 'A'.repeat(43) + '='

describe('QR sign-in schemas', () => {
  it('reads a short code in any case, with or without the dash', () => {
    expect(qrLoginCodeSchema.parse('kq7m-2pxd')).toBe('KQ7M2PXD')
    expect(qrLoginCodeSchema.parse('KQ7M 2PXD')).toBe('KQ7M2PXD')
    // Crockford base32 has no I, L, O or U, and a code has exactly 8 characters.
    expect(qrLoginCodeSchema.safeParse('KQ7M-2PXO').success).toBe(false)
    expect(qrLoginCodeSchema.safeParse('KQ7M-2PX').success).toBe(false)
  })

  it('takes an optional 32-byte key from the new device', () => {
    expect(createQrLoginRequestSchema.parse({})).toEqual({})
    expect(createQrLoginRequestSchema.parse({ publicKey: KEY })).toEqual({ publicKey: KEY })
    expect(createQrLoginRequestSchema.safeParse({ publicKey: 'AAAA' }).success).toBe(false)
  })

  it('wants the sealed secrets and the approver key together, or neither', () => {
    expect(approveQrLoginRequestSchema.safeParse({}).success).toBe(true)
    expect(
      approveQrLoginRequestSchema.safeParse({ sealed: 'AAAA', approverKey: KEY }).success,
    ).toBe(true)
    expect(approveQrLoginRequestSchema.safeParse({ sealed: 'AAAA' }).success).toBe(false)
    expect(approveQrLoginRequestSchema.safeParse({ approverKey: KEY }).success).toBe(false)
  })
})
