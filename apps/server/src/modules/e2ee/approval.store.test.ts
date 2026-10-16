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
    await store.create(approval('2026-10-16T10:10:00.000Z'))

    await store.update({ ...approval('2026-10-16T10:10:00.000Z'), state: 'accepted' })
    expect((await store.find('1'))?.state).toBe('accepted')

    now = Date.parse('2026-10-16T10:11:00.000Z')
    expect(await store.find('1')).toBeNull()
    await store.update({ ...approval('2026-10-16T10:10:00.000Z'), state: 'revealed' })
    expect(await store.find('1')).toBeNull()
  })
})
