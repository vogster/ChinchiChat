import { describe, expect, it } from 'vitest'

import {
  deriveRecoveryKeys,
  formatRecoveryKey,
  generateRecoveryKey,
  openEntry,
  openUserKey,
  parseRecoveryKey,
  sealEntry,
  sealUserKey,
} from './recovery'

describe('recovery key', () => {
  it('reads back what it shows, forgiving case, spaces and look-alike letters', () => {
    const key = generateRecoveryKey()
    const shown = formatRecoveryKey(key)

    expect(shown).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(parseRecoveryKey(shown)).toEqual(key)
    const sloppy = ` ${shown.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l')} `
    expect(parseRecoveryKey(sloppy)).toEqual(key)
    expect(parseRecoveryKey('ABCD-EFGH')).toBeNull()
    expect(parseRecoveryKey(`${shown}U`)).toBeNull()
  })

  it('seals the user key so only the same recovery key opens it', async () => {
    const userKey = { publicKey: 'cHVi', privateKey: 'cHJpdg==' }
    const keys = await deriveRecoveryKeys(generateRecoveryKey())
    const other = await deriveRecoveryKeys(generateRecoveryKey())

    const sealed = await sealUserKey(keys, userKey)

    expect(await openUserKey(keys, sealed)).toEqual(userKey)
    expect(await openUserKey(other, sealed)).toBeNull()
  })

  it('seals history entries to their message: one can not stand in for another', async () => {
    const keys = await deriveRecoveryKeys(generateRecoveryKey())
    const payload = { v: 1 as const, text: 'Секрет' }

    const sealed = await sealEntry(keys, '501', payload)

    expect(await openEntry(keys, '501', sealed)).toEqual(payload)
    expect(await openEntry(keys, '502', sealed)).toBeNull()
  })
})
