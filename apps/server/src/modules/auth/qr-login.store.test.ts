import { QR_LOGIN_SECONDS } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { createMemoryQrLoginStore } from './qr-login.store'

import type { QrLogin } from './qr-login.store'

const login: QrLogin = {
  id: 'abcdefghijklmnop',
  code: 'KQ7M2PXD',
  secretHash: 'hash',
  publicKey: null,
  userAgent: null,
  ipAddress: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  approvedBy: null,
  sealed: null,
  approverKey: null,
}

describe('the in-memory QR sign-in store', () => {
  it('finds a sign-in by id or code, keeps changes, and forgets it when it expires', async () => {
    let now = 1_000
    const store = createMemoryQrLoginStore(() => now)
    await store.create(login)

    expect(await store.findByCode('KQ7M2PXD')).toEqual(login)
    await store.update({ ...login, approvedBy: '42' })
    expect((await store.find(login.id))?.approvedBy).toBe('42')

    now += QR_LOGIN_SECONDS * 1000
    expect(await store.find(login.id)).toBeNull()
    expect(await store.findByCode('KQ7M2PXD')).toBeNull()
  })

  it('deletes a used sign-in', async () => {
    const store = createMemoryQrLoginStore()
    await store.create(login)
    await store.delete(login)
    expect(await store.find(login.id)).toBeNull()
  })
})
