import { describe, expect, it } from 'vitest'

import { BIO_MAX_LENGTH, memberNicknameRequestSchema, userProfileSchema } from './profile.schemas'
import { updateProfileRequestSchema } from './user.schemas'

describe('profile schemas', () => {
  it('takes a short bio, trimmed, and null to clear it', () => {
    expect(updateProfileRequestSchema.parse({ bio: '  Люблю котиков  ' })).toEqual({
      bio: 'Люблю котиков',
    })
    expect(updateProfileRequestSchema.parse({ bio: null })).toEqual({ bio: null })
    expect(
      updateProfileRequestSchema.safeParse({ bio: 'x'.repeat(BIO_MAX_LENGTH + 1) }).success,
    ).toBe(false)
  })

  it('sets or clears a server nickname', () => {
    expect(memberNicknameRequestSchema.parse({ nickname: ' Котик ' })).toEqual({
      nickname: 'Котик',
    })
    expect(memberNicknameRequestSchema.parse({ nickname: '' })).toEqual({ nickname: null })
    expect(memberNicknameRequestSchema.parse({ nickname: null })).toEqual({ nickname: null })
    expect(memberNicknameRequestSchema.safeParse({ nickname: 'x'.repeat(33) }).success).toBe(false)
  })

  it('describes what a viewer may see of someone', () => {
    const profile = {
      user: { id: '2', username: 'bob', displayName: null, avatarUrl: null },
      bio: null,
      createdAt: '2026-10-14T12:00:00.000Z',
      bannerUrl: null,
      accentColor: null,
      relationship: 'friend',
      mutualGuildIds: ['1'],
      mutualFriends: [],
      member: { nickname: null, roleIds: [], joinedAt: '2026-10-14T12:00:00.000Z' },
    }
    expect(userProfileSchema.parse(profile)).toEqual(profile)
  })
})
