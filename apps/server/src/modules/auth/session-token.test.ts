import { describe, expect, it } from 'vitest'

import { generateSessionToken, hashSessionToken } from './session-token'

describe('session tokens', () => {
  it('generates url-safe tokens with 256 bits of entropy', () => {
    const { token } = generateSessionToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken().token))
    expect(tokens.size).toBe(100)
  })

  it('returns the sha-256 hash alongside the token', () => {
    const { token, tokenHash } = generateSessionToken()
    expect(tokenHash).toBe(hashSessionToken(token))
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(tokenHash).not.toContain(token)
  })
})
