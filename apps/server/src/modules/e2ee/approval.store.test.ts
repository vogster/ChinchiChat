import { describe, expect, it } from 'vitest'

import { createMemoryApprovalStore } from './approval.store'

import type { StoredApproval } from './approval.store'

const approval = (expiresAt: string): StoredApproval => ({
  id: '1',
  userId: '2',
  newDeviceId: '3',
  commitment: 'AAAA',
  newKey: null,
  approverDeviceId: null,
  approverKey: null,
  secrets: null,
  state: 'requested',
  expiresAt,
})

describe('memory approval store', () => {
  it('keeps an approval until it expires, and updates only a live one', async () => {
    let now = Date.parse('2026-10-16T10:00:00.000Z')
    const store = createMemoryApprovalStore(() => now)
    const first = approval('2026-10-16T10:10:00.000Z')
    await store.create(first)

    const accepted = { ...first, state: 'accepted' as const }
    expect(await store.replace(first, accepted)).toBe(true)
    expect((await store.find('1'))?.state).toBe('accepted')

    now = Date.parse('2026-10-16T10:11:00.000Z')
    expect(await store.find('1')).toBeNull()
    expect(await store.replace(accepted, { ...accepted, state: 'revealed' })).toBe(false)
    expect(await store.find('1')).toBeNull()
  })

  it('replaces only what is still as it was read: one of two answers wins', async () => {
    const store = createMemoryApprovalStore()
    const read = approval('2099-01-01T00:00:00.000Z')
    await store.create(read)

    expect(await store.replace(read, { ...read, state: 'accepted', approverDeviceId: '4' })).toBe(
      true,
    )
    expect(await store.replace(read, { ...read, state: 'accepted', approverDeviceId: '5' })).toBe(
      false,
    )
    expect((await store.find('1'))?.approverDeviceId).toBe('4')
  })
})
