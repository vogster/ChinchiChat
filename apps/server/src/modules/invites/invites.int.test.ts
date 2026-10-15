import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { invites } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()

let owner: TestActor
let member: TestActor
let newcomer: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>

const call = (
  actor: TestActor | null,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor?.headers ?? {},
    ...(payload ? { payload } : {}),
  })

const channelId = (type: string) => {
  const found = guild.channels.find((channel) => channel.type === type)
  if (!found) throw new Error(`No ${type} channel`)
  return found.id
}

const createInvite = async (actor: TestActor = member, body: object = {}) => {
  const response = await call(actor, 'POST', `/channels/${channelId('text')}/invites`, body)
  return response.json().data.invite as { code: string; uses: number; maxUses: number | null }
}

const join = (actor: TestActor, code: string) => call(actor, 'POST', `/invites/${code}`)

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  newcomer = await signUp(app, { username: 'newcomer', email: 'newcomer@example.com' })
  guild = await createGuild(app, owner, 'Cats')
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('POST /api/v1/channels/:id/invites', () => {
  it('lets any member create an invite that expires in 7 days by default', async () => {
    const response = await call(member, 'POST', `/channels/${channelId('text')}/invites`, {})

    expect(response.statusCode).toBe(201)
    const invite = response.json().data.invite
    expect(invite).toMatchObject({
      code: expect.stringMatching(/^[A-Za-z0-9]{8}$/),
      guild: { id: guild.id, name: 'Cats', memberCount: 2 },
      inviter: { username: 'member' },
      uses: 0,
      maxUses: null,
    })
    const days = (new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('supports invites that never expire and limited uses', async () => {
    const invite = await createInvite(member, { maxAgeSeconds: 0, maxUses: 5 })

    const preview = (await call(null, 'GET', `/invites/${invite.code}`)).json().data.invite
    expect(preview).toMatchObject({ expiresAt: null, maxUses: 5 })
  })

  it('works for voice channels but not categories', async () => {
    const voice = await call(member, 'POST', `/channels/${channelId('voice')}/invites`, {})
    const category = await call(member, 'POST', `/channels/${channelId('category')}/invites`, {})

    expect(voice.statusCode).toBe(201)
    expect(category.statusCode).toBe(400)
    expect(category.json()).toMatchObject({ code: 'INVALID_CHANNEL' })
  })

  it('hides the channel from outsiders', async () => {
    const response = await call(newcomer, 'POST', `/channels/${channelId('text')}/invites`, {})
    expect(response.statusCode).toBe(404)
  })
})

describe('GET /api/v1/invites/:code', () => {
  it('shows a preview without signing in', async () => {
    const invite = await createInvite()

    const response = await call(null, 'GET', `/invites/${invite.code}`)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.invite).toMatchObject({
      guild: { name: 'Cats', memberCount: 2 },
      channel: { name: 'general', type: 'text' },
    })
  })

  it.each([
    ['unknown', async () => 'nope1234'],
    [
      'expired',
      async () => {
        const invite = await createInvite()
        await db.update(invites).set({ expiresAt: sql`now() - interval '1 second'` })
        return invite.code
      },
    ],
  ])('answers 404 for %s invites', async (_label, codeOf) => {
    const response = await call(null, 'GET', `/invites/${await codeOf()}`)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_INVITE' })
  })
})

describe('POST /api/v1/invites/:code (join)', () => {
  it('adds the user to the server and counts the use', async () => {
    const invite = await createInvite()

    const response = await join(newcomer, invite.code)

    expect(response.statusCode).toBe(200)
    expect(response.json().data.guild).toMatchObject({ id: guild.id, name: 'Cats' })
    expect((await call(newcomer, 'GET', `/guilds/${guild.id}`)).statusCode).toBe(200)
    expect((await call(null, 'GET', `/invites/${invite.code}`)).json().data.invite.uses).toBe(1)
  })

  it('is a no-op for existing members and does not use up the invite', async () => {
    const invite = await createInvite()

    const response = await join(member, invite.code)

    expect(response.statusCode).toBe(200)
    expect((await call(null, 'GET', `/invites/${invite.code}`)).json().data.invite.uses).toBe(0)
  })

  it('stops working once all uses are taken', async () => {
    const invite = await createInvite(member, { maxUses: 1 })
    const late = await signUp(app, { username: 'late', email: 'late@example.com' })

    expect((await join(newcomer, invite.code)).statusCode).toBe(200)
    const response = await join(late, invite.code)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_INVITE' })
    expect((await call(late, 'GET', `/guilds/${guild.id}`)).statusCode).toBe(404)
  })

  it('never lets more people in than allowed, even concurrently', async () => {
    const invite = await createInvite(member, { maxUses: 2 })
    const crowd = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        signUp(app, { username: `crowd${i}`, email: `crowd${i}@example.com` }),
      ),
    )

    const results = await Promise.all(crowd.map((actor) => join(actor, invite.code)))

    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2)
    const members = (await call(owner, 'GET', `/guilds/${guild.id}/members`)).json().data.members
    expect(members).toHaveLength(4)
  })

  it('requires an account', async () => {
    const invite = await createInvite()
    expect((await call(null, 'POST', `/invites/${invite.code}`)).statusCode).toBe(401)
  })
})

describe('managing invites', () => {
  it('lists server invites for the owner only', async () => {
    await createInvite(member)
    await createInvite(owner)

    const asOwner = await call(owner, 'GET', `/guilds/${guild.id}/invites`)
    const asMember = await call(member, 'GET', `/guilds/${guild.id}/invites`)

    expect(asOwner.json().data.invites).toHaveLength(2)
    expect(asMember.statusCode).toBe(403)
  })

  it('lets the inviter or the owner revoke an invite', async () => {
    const byMember = await createInvite(member)
    const byOwner = await createInvite(owner)

    expect((await call(member, 'DELETE', `/invites/${byMember.code}`)).statusCode).toBe(204)
    expect((await call(owner, 'DELETE', `/invites/${byOwner.code}`)).statusCode).toBe(204)
    expect((await call(null, 'GET', `/invites/${byMember.code}`)).statusCode).toBe(404)
  })

  it("does not let other members revoke someone else's invite", async () => {
    const byOwner = await createInvite(owner)

    const response = await call(member, 'DELETE', `/invites/${byOwner.code}`)

    expect(response.statusCode).toBe(403)
    expect((await call(null, 'GET', `/invites/${byOwner.code}`)).statusCode).toBe(200)
  })
})
