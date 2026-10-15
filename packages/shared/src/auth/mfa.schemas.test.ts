import { describe, expect, it } from 'vitest'

import { loginResultSchema, mfaCodeSchema, totpCodeSchema } from './mfa.schemas'

describe('totpCodeSchema', () => {
  it('takes six digits, ignoring spaces', () => {
    expect(totpCodeSchema.parse(' 123 456 ')).toBe('123456')
    expect(totpCodeSchema.safeParse('12345').success).toBe(false)
    expect(totpCodeSchema.safeParse('abcdef').success).toBe(false)
  })
})

describe('mfaCodeSchema', () => {
  it('takes an app code or a recovery code, normalized', () => {
    expect(mfaCodeSchema.parse('123 456')).toBe('123456')
    expect(mfaCodeSchema.parse(' ABCDE-FGHIJ ')).toBe('abcde-fghij')
    expect(mfaCodeSchema.parse('abcdefghij')).toBe('abcde-fghij')
    expect(mfaCodeSchema.safeParse('abc').success).toBe(false)
  })
})

describe('loginResultSchema', () => {
  it('is either a signed-in user or a second step', () => {
    expect(loginResultSchema.safeParse({ mfaTicket: 'x'.repeat(43) }).success).toBe(true)
    expect(loginResultSchema.safeParse({ mfaTicket: 1 }).success).toBe(false)
  })
})
