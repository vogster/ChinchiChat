import { describe, expect, it } from 'vitest'

import { registerRequestSchema } from '../auth/auth.schemas'
import {
  createInstanceInviteRequestSchema,
  instanceInviteCodeSchema,
  updateInstanceSettingsRequestSchema,
} from './admin.schemas'
import { registrationModeSchema } from './instance.schemas'

describe('instance administration schemas', () => {
  it('knows registration by invite', () => {
    expect(registrationModeSchema.options).toEqual(['open', 'invite', 'closed'])
  })

  it('accepts an optional invite code when registering', () => {
    const base = { username: 'alice', email: 'a@example.com', password: 'password123' }
    expect(registerRequestSchema.parse({ ...base, inviteCode: ' Abcd1234 ' }).inviteCode).toBe(
      'Abcd1234',
    )
    expect(registerRequestSchema.safeParse({ ...base, inviteCode: 'no!' }).success).toBe(false)
    expect(instanceInviteCodeSchema.safeParse('short').success).toBe(false)
  })

  it('creates single-use weekly invites by default', () => {
    expect(createInstanceInviteRequestSchema.parse({})).toEqual({
      maxUses: 1,
      expiresInSeconds: 7 * 86_400,
    })
  })

  it('needs something to change in the settings', () => {
    expect(updateInstanceSettingsRequestSchema.safeParse({}).success).toBe(false)
    expect(
      updateInstanceSettingsRequestSchema.parse({
        registrationMode: 'invite',
        maxGuildsPerUser: null,
      }),
    ).toEqual({ registrationMode: 'invite', maxGuildsPerUser: null })
  })
})
