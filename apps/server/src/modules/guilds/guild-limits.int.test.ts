import { MAX_CHANNELS_PER_GUILD, MAX_INVITES_PER_GUILD, MAX_ROLES_PER_GUILD } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { channels, invites, roles } from '../../db/schema'

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

const createRole = (name: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${guild.id}/roles`,
    headers: owner.headers,
    payload: { name },
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

  it('caps the roles of a server (@everyone included)', async () => {
    await db.insert(roles).values(
      Array.from({ length: MAX_ROLES_PER_GUILD - 2 }, (_, i) => ({
        id: String(910_000_000 + i),
        guildId: guild.id,
        name: `filler-${i}`,
        position: i + 1,
      })),
    )

    expect((await createRole('last-one')).statusCode).toBe(201)
    const over = await createRole('one-too-many')
    expect(over.statusCode).toBe(400)
    expect(over.json().code).toBe('TOO_MANY_ROLES')
  })

  it('gives roles created at the same time positions of their own', async () => {
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createRole(`parallel-${i}`)),
    )
    expect(created.map((r) => r.statusCode)).toEqual(Array(8).fill(201))

    const positions = (await db.select().from(roles)).map((role) => role.position)
    expect(new Set(positions).size).toBe(positions.length)
    expect(Math.max(...positions)).toBe(positions.length - 1)
  })
})
