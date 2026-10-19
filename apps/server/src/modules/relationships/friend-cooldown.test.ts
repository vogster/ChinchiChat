import { describe, expect, it } from 'vitest'

import { createMemoryFriendCooldown, FRIEND_COOLDOWN_SECONDS } from './friend-cooldown'

describe('the in-memory friend request cooldown', () => {
  it('holds back one direction of one pair until the day is over', async () => {
    let now = 1_000
    const cooldown = createMemoryFriendCooldown(() => now)

    await cooldown.start('alice', 'bob')
    expect(await cooldown.active('alice', 'bob')).toBe(true)
    expect(await cooldown.active('bob', 'alice')).toBe(false)
    expect(await cooldown.active('alice', 'carol')).toBe(false)

    now += FRIEND_COOLDOWN_SECONDS * 1000
    expect(await cooldown.active('alice', 'bob')).toBe(false)
  })
})
