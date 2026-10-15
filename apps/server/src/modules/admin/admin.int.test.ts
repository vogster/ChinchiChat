import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { WEB_ORIGIN, registerUser } from '../../../test/auth-helpers'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let admin: TestActor
let member: TestActor

const call = (
  actor: TestActor | null,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor ? actor.headers : { origin: WEB_ORIGIN },
    ...(payload ? { payload } : {}),
  })

const register = (username: string, inviteCode?: string) =>
  call(null, 'POST', '/auth/register', {
    username,
    email: `${username}@example.com`,
    password: 'password123',
    ...(inviteCode ? { inviteCode } : {}),
  })

beforeEach(async () => {
  await resetState(db, redis)
  admin = await signUp(app, { username: 'admin', email: 'admin@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
})

afterAll(async () => {
  await close()
})

describe('instance admins', () => {
  it('makes the first account an admin, and only that one', async () => {
    const me = async (actor: TestActor) =>
      (await call(actor, 'GET', '/users/@me')).json().data.user.isAdmin
    expect(await me(admin)).toBe(true)
    expect(await me(member)).toBe(false)
  })

  it('keeps the admin API to admins', async () => {
    const response = await call(member, 'GET', '/admin/settings')
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('NOT_ADMIN')
    expect((await call(null, 'GET', '/admin/settings')).statusCode).toBe(401)
  })
})

describe('registration', () => {
  it('can require an invite from the instance', async () => {
    const settings = await call(admin, 'PATCH', '/admin/settings', { registrationMode: 'invite' })
    expect(settings.json().data.settings).toEqual({
      registrationMode: 'invite',
      maxGuildsPerUser: null,
    })
    const instance = await call(null, 'GET', '/instance')
    expect(instance.json().data.instance.registrationMode).toBe('invite')

    const without = await register('carol')
    expect(without.statusCode).toBe(403)
    expect(without.json().code).toBe('INVITE_REQUIRED')

    const invite = (await call(admin, 'POST', '/admin/invites', { maxUses: 1 })).json().data.invite
    expect(invite).toMatchObject({ uses: 0, maxUses: 1, createdBy: { username: 'admin' } })

    // A registration that fails for another reason doesn't use the invite up.
    expect((await register('member', invite.code)).statusCode).toBe(409)
    expect((await register('carol', invite.code)).statusCode).toBe(201)
    const again = await register('dave', invite.code)
    expect(again.statusCode).toBe(403)
    expect(again.json().code).toBe('INVALID_INVITE')

    const listed = (await call(admin, 'GET', '/admin/invites')).json().data.invites
    expect(listed[0]).toMatchObject({ code: invite.code, uses: 1 })
    expect((await call(admin, 'DELETE', `/admin/invites/${invite.code}`)).statusCode).toBe(204)
  })

  it('can be closed', async () => {
    await call(admin, 'PATCH', '/admin/settings', { registrationMode: 'closed' })
    const response = await register('carol')
    expect(response.json().code).toBe('REGISTRATION_CLOSED')
  })
})

describe('managing users', () => {
  it('finds accounts by name or email', async () => {
    const all = (await call(admin, 'GET', '/admin/users')).json().data.users
    expect(all.map((u: { user: { username: string } }) => u.user.username)).toEqual([
      'member',
      'admin',
    ])
    const found = (await call(admin, 'GET', '/admin/users?query=MEMBER@')).json().data.users
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      email: 'member@example.com',
      isAdmin: false,
      suspended: false,
    })
  })

  it('suspends an account: sessions end and sign-in is refused until lifted', async () => {
    const suspended = await call(admin, 'PATCH', `/admin/users/${member.id}`, { suspended: true })
    expect(suspended.statusCode).toBe(200)
    expect(suspended.json().data.user.suspended).toBe(true)

    expect((await call(member, 'GET', '/users/@me')).statusCode).toBe(401)
    const login = () =>
      call(null, 'POST', '/auth/login', { login: 'member', password: 'password123' })
    const refused = await login()
    expect(refused.statusCode).toBe(403)
    expect(refused.json().code).toBe('ACCOUNT_SUSPENDED')

    await call(admin, 'PATCH', `/admin/users/${member.id}`, { suspended: false })
    expect((await login()).statusCode).toBe(200)
  })

  it('grants admin rights, but never changes your own account', async () => {
    await call(admin, 'PATCH', `/admin/users/${member.id}`, { admin: true })
    expect((await call(member, 'GET', '/admin/settings')).statusCode).toBe(200)

    const self = await call(admin, 'PATCH', `/admin/users/${admin.id}`, { suspended: true })
    expect(self.statusCode).toBe(400)
    expect(self.json().code).toBe('CANNOT_MODIFY_SELF')
  })
})

describe('managing servers', () => {
  it('lists servers with their owners and sizes, and deletes them', async () => {
    const guild = await createGuild(app, member, 'Котики')
    await addMember(db, guild.id, admin.id)

    const listed = (await call(admin, 'GET', '/admin/guilds?query=кот')).json().data.guilds
    expect(listed).toEqual([
      expect.objectContaining({
        id: guild.id,
        owner: expect.objectContaining({ id: member.id }),
        memberCount: 2,
      }),
    ])

    expect((await call(admin, 'DELETE', `/admin/guilds/${guild.id}`)).statusCode).toBe(204)
    expect((await call(member, 'GET', `/guilds/${guild.id}`)).statusCode).toBe(404)
  })

  it('limits how many servers one person owns', async () => {
    await call(admin, 'PATCH', '/admin/settings', { maxGuildsPerUser: 1 })
    await createGuild(app, member)

    const second = await call(member, 'POST', '/guilds', { name: 'Ещё один', locale: 'ru' })
    expect(second.statusCode).toBe(403)
    expect(second.json().code).toBe('GUILD_LIMIT')
  })
})

describe('keeping the instance run', () => {
  it('never leaves it without an active admin', async () => {
    await call(admin, 'PATCH', `/admin/users/${member.id}`, { admin: true })
    // Two admins demoting each other at once: one of them must stay.
    const [a, b] = await Promise.all([
      call(admin, 'PATCH', `/admin/users/${member.id}`, { admin: false }),
      call(member, 'PATCH', `/admin/users/${admin.id}`, { admin: false }),
    ])
    const codes = [a.statusCode, b.statusCode].sort()
    expect(codes).toEqual([200, 400])
    expect([a, b].find((r) => r.statusCode === 400)?.json().code).toBe('LAST_ADMIN')
  })

  it('counts the server limit for whoever receives a server', async () => {
    await call(admin, 'PATCH', '/admin/settings', { maxGuildsPerUser: 1 })
    await createGuild(app, member)
    const mine = await createGuild(app, admin)
    await addMember(db, mine.id, member.id)

    const transfer = await call(admin, 'POST', `/guilds/${mine.id}/transfer`, {
      userId: member.id,
    })
    expect(transfer.statusCode).toBe(403)
    expect(transfer.json().code).toBe('GUILD_LIMIT')
  })
})

describe('first admin', () => {
  it('is whoever registered first, even with registration closed later', async () => {
    const { response } = await registerUser(app, { username: 'zed', email: 'zed@example.com' })
    expect(response.json().data.user.isAdmin).toBe(false)
  })
})
