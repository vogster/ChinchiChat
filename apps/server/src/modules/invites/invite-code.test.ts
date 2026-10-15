import { describe, expect, it } from 'vitest'

import { INVITE_CODE_LENGTH, generateInviteCode } from './invite-code'

describe('generateInviteCode', () => {
  it('produces base62 codes of the configured length', () => {
    expect(generateInviteCode()).toMatch(new RegExp(`^[A-Za-z0-9]{${INVITE_CODE_LENGTH}}$`))
  })

  it('does not repeat in practice', () => {
    const codes = new Set(Array.from({ length: 1_000 }, generateInviteCode))
    expect(codes.size).toBe(1_000)
  })
})
