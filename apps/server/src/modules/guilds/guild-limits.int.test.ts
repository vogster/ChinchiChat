import { MAX_CHANNELS_PER_GUILD, MAX_INVITES_PER_GUILD } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { channels, invites } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const createChannel = (name: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${guild.id}/channels`,
    headers: owner.headers,
    payload: { name, type: 'text' },
  })

const createInvite = () =>
  app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/invites`,
    headers: owner.headers,
    payload: {},
  })

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('server limits', () => {
  it('caps the channels of a server (threads not counted)', async () => {
    const room = MAX_CHANNELS_PER_GUILD - guild.channels.length - 1
    await db.insert(channels).values(
      Array.from({ length: room }, (_, i) => ({
        id: String(900_000_000 + i),
        guildId: guild.id,
        type: 'text' as const,
        name: `filler-${i}`,
      })),
    )

    expect((await createChannel('last-one')).statusCode).toBe(201)
    const over = await createChannel('one-too-many')
    expect(over.statusCode).toBe(400)
    expect(over.json().code).toBe('TOO_MANY_CHANNELS')
  })

  it('caps active invites, while expired and used-up ones free their place', async () => {
    const past = new Date(Date.now() - 1000)
    await db.insert(invites).values([
      ...Array.from({ length: MAX_INVITES_PER_GUILD - 1 }, (_, i) => ({
        code: `live${i}`,
        guildId: guild.id,
        channelId: textId,
      })),
      { code: 'expired', guildId: guild.id, channelId: textId, expiresAt: past },
      { code: 'usedup', guildId: guild.id, channelId: textId, maxUses: 1, uses: 1 },
    ])

    expect((await createInvite()).statusCode).toBe(201)
    const over = await createInvite()
    expect(over.statusCode).toBe(400)
    expect(over.json().code).toBe('TOO_MANY_INVITES')
  })
})
