import { describe, expect, it } from 'vitest'

import { base32Encode, generateTotpSecret, totpCode, totpUri, verifyTotp } from './totp'

// RFC 6238 test secret: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors (SHA-1, last six digits)', () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe('287082')
    expect(totpCode(RFC_SECRET, Math.floor(1_111_111_109 / 30))).toBe('081804')
    expect(totpCode(RFC_SECRET, Math.floor(2_000_000_000 / 30))).toBe('279037')
  })

  it('accepts the current code and its neighbours, once', () => {
    const now = 1_111_111_109_000
    const step = Math.floor(now / 30_000)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, null)).toBe(step)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null)).toBe(step - 1)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null)).toBe(step + 1)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toBeNull()
    // A code already used (or an older one) can't be replayed.
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now, step)).toBeNull()
    expect(verifyTotp(RFC_SECRET, '000000', now, null)).toBeNull()
  })

  it('makes 160-bit base32 secrets and an otpauth link for apps', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    const uri = new URL(totpUri(secret, 'alice', 'Chinchi'))
    expect(uri.protocol).toBe('otpauth:')
    expect(uri.searchParams.get('secret')).toBe(secret)
    expect(uri.searchParams.get('issuer')).toBe('Chinchi')
    expect(uri.host).toBe('totp')
    expect(decodeURIComponent(uri.pathname)).toBe('/Chinchi:alice')
  })
})
