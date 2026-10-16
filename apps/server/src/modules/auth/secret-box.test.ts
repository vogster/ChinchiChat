import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createSecretBox, isSealed } from './secret-box'

const key = randomBytes(32)

describe('secret box', () => {
  it('seals a secret so the database never holds it, and opens it back', () => {
    const box = createSecretBox(key)
    const sealed = box.seal('JBSWY3DPEHPK3PXP')

    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP')
    expect(sealed).toMatch(/^enc1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP')
    // A fresh nonce every time: equal secrets never look equal.
    expect(box.seal('JBSWY3DPEHPK3PXP')).not.toBe(sealed)
  })

  it('still reads secrets stored before a key existed', () => {
    expect(createSecretBox(key).open('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP')
    expect(isSealed('JBSWY3DPEHPK3PXP')).toBe(false)
  })

  it('refuses a wrong key, a tampered value and a key of the wrong size', () => {
    const sealed = createSecretBox(key).seal('secret')
    expect(() => createSecretBox(randomBytes(32)).open(sealed)).toThrow()
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`
    expect(() => createSecretBox(key).open(tampered)).toThrow()
    expect(() => createSecretBox(randomBytes(16))).toThrow(/32 bytes/)
  })

  it('stores plaintext without a key, and says so when asked to open a sealed value', () => {
    const box = createSecretBox(undefined)
    expect(box.enabled).toBe(false)
    expect(box.seal('secret')).toBe('secret')
    expect(() => box.open(createSecretBox(key).seal('secret'))).toThrow(/SECRETS_KEY/)
  })
})
