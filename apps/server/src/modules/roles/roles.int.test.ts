import { readFileSync } from 'node:fs'
import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()

let owner: TestActor
let member: TestActor
let other: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload !== undefined ? { payload: payload as object } : {}),
  })

const perms = (...flags: bigint[]) => String(flags.reduce((acc, flag) => acc | flag, 0n))

const createRole = async (body: object = {}, actor: TestActor = owner) => {
  const response = await call(actor, 'POST', `/guilds/${guild.id}/roles`, body)
  return response.json().data.role as {
    id: string
    position: number
    permissions: string
    name: string
  }
}

const grant = (roleId: string, userId: string, actor: TestActor = owner) =>
  call(actor, 'PUT', `/guilds/${guild.id}/members/${userId}/roles/${roleId}`)

const listRoles = async () =>
  (await call(owner, 'GET', `/guilds/${guild.id}/roles`)).json().data.roles as {
    id: string
    name: string
    position: number
    permissions: string
  }[]

const visibleChannelIds = async (actor: TestActor) =>
  (
    (await call(actor, 'GET', `/guilds/${guild.id}`)).json().data.guild.channels as { id: string }[]
  ).map((c) => c.id)

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  other = await signUp(app, { username: 'other', email: 'other@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  await addMember(db, guild.id, other.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('@everyone', () => {
  it('exists for every server with the default permissions', async () => {
    expect(await listRoles()).toEqual([
      expect.objectContaining({
        id: guild.id,
        name: '@everyone',
        position: 0,
        permissions: String(DEFAULT_EVERYONE_PERMISSIONS),
      }),
    ])
  })

  it('matches what the migration gives existing servers', () => {
    const sql = readFileSync(new URL('../../../drizzle/0006_roles.sql', import.meta.url), 'utf8')
    expect(sql).toContain(`'@everyone', 0, 0, ${DEFAULT_EVERYONE_PERMISSIONS}, false, false`)
  })

  it('cannot be deleted or renamed', async () => {
    expect(
      (await call(owner, 'DELETE', `/guilds/${guild.id}/roles/${guild.id}`)).json(),
    ).toMatchObject({
      code: 'INVALID_ROLE',
    })
    expect(
      (await call(owner, 'PATCH', `/guilds/${guild.id}/roles/${guild.id}`, { name: 'all' })).json(),
    ).toMatchObject({
      code: 'INVALID_ROLE',
    })
  })

  it('controls what regular members can do', async () => {
    const withoutSend = String(DEFAULT_EVERYONE_PERMISSIONS & ~Permission.SendMessages)
    await call(owner, 'PATCH', `/guilds/${guild.id}/roles/${guild.id}`, {
      permissions: withoutSend,
    })

    const response = await call(member, 'POST', `/channels/${textId}/messages`, { content: 'hi' })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'MISSING_PERMISSIONS' })
  })
})

describe('managing roles', () => {
  it('creates a role just above @everyone and announces it', async () => {
    const first = await createRole({ name: 'Members', color: 0x3498db })
    const second = await createRole({ name: 'Mods', permissions: perms(Permission.ManageMessages) })

    expect(second).toMatchObject({
      name: 'Mods',
      position: 1,
      permissions: String(Permission.ManageMessages),
    })
    expect((await listRoles()).map((r) => [r.name, r.position])).toEqual([
      ['Members', 2],
      ['Mods', 1],
      ['@everyone', 0],
    ])
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_ROLE_CREATE',
        data: { guildId: guild.id, role: expect.objectContaining({ id: first.id }) },
      }),
    )
  })

  it('updates and deletes roles', async () => {
    const role = await createRole({ name: 'Old' })

    const updated = await call(owner, 'PATCH', `/guilds/${guild.id}/roles/${role.id}`, {
      name: 'New',
      hoist: true,
    })
    expect(updated.json().data.role).toMatchObject({ name: 'New', hoist: true })

    expect((await call(owner, 'DELETE', `/guilds/${guild.id}/roles/${role.id}`)).statusCode).toBe(
      204,
    )
    expect((await listRoles()).map((r) => r.id)).not.toContain(role.id)
  })

  it('reorders roles', async () => {
    const a = await createRole({ name: 'A' })
    const b = await createRole({ name: 'B' })

    const response = await call(owner, 'PATCH', `/guilds/${guild.id}/roles`, [
      { id: a.id, position: 1 },
      { id: b.id, position: 2 },
    ])

    expect(response.statusCode).toBe(200)
    expect((await listRoles()).map((r) => r.name)).toEqual(['B', 'A', '@everyone'])
  })

  it('requires MANAGE_ROLES', async () => {
    expect((await call(member, 'POST', `/guilds/${guild.id}/roles`, {})).statusCode).toBe(403)
  })

  it('lets a manager touch only roles below their own highest role', async () => {
    const low = await createRole({ name: 'Low' })
    const manager = await createRole({
      name: 'Manager',
      permissions: perms(Permission.ManageRoles),
    })
    const high = await createRole({ name: 'High' })
    // New roles always land just above @everyone, so set the intended order explicitly.
    await call(owner, 'PATCH', `/guilds/${guild.id}/roles`, [
      { id: low.id, position: 1 },
      { id: manager.id, position: 2 },
      { id: high.id, position: 3 },
    ])
    await grant(manager.id, member.id)

    expect(
      (await call(member, 'PATCH', `/guilds/${guild.id}/roles/${low.id}`, { name: 'Lower' }))
        .statusCode,
    ).toBe(200)
    for (const target of [manager, high]) {
      const response = await call(member, 'PATCH', `/guilds/${guild.id}/roles/${target.id}`, {
        name: 'Mine',
      })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'ROLE_HIERARCHY' })
    }
    expect((await grant(high.id, other.id, member)).statusCode).toBe(403)
    expect((await grant(low.id, other.id, member)).statusCode).toBe(204)
    // Nor can they lift a role above their own.
    const lift = await call(member, 'PATCH', `/guilds/${guild.id}/roles`, [
      { id: low.id, position: 5 },
    ])
    expect(lift.statusCode).toBe(403)
  })

  it('does not let a manager hand out permissions they do not have', async () => {
    const manager = await createRole({
      name: 'Manager',
      permissions: perms(Permission.ManageRoles),
    })
    await grant(manager.id, member.id)

    const response = await call(member, 'POST', `/guilds/${guild.id}/roles`, {
      permissions: perms(Permission.Administrator),
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'MISSING_PERMISSIONS' })
  })
})

describe('member roles', () => {
  it('assigns and removes roles and lists them on members', async () => {
    const role = await createRole({ name: 'Helper' })

    expect((await grant(role.id, member.id)).statusCode).toBe(204)
    const members = (await call(owner, 'GET', `/guilds/${guild.id}/members`)).json().data.members
    expect(members.find((m: { user: { id: string } }) => m.user.id === member.id).roleIds).toEqual([
      role.id,
    ])
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_MEMBER_UPDATE',
        data: {
          guildId: guild.id,
          userId: member.id,
          roleIds: [role.id],
          nickname: null,
          timeoutUntil: null,
        },
      }),
    )

    expect(
      (await call(owner, 'DELETE', `/guilds/${guild.id}/members/${member.id}/roles/${role.id}`))
        .statusCode,
    ).toBe(204)
    expect((await call(member, 'GET', `/guilds/${guild.id}`)).json().data.guild.myRoleIds).toEqual(
      [],
    )
  })

  it('rejects unknown roles and non-members', async () => {
    const role = await createRole()
    const outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })

    expect((await grant('123', member.id)).json()).toMatchObject({ code: 'UNKNOWN_ROLE' })
    expect((await grant(role.id, outsider.id)).json()).toMatchObject({ code: 'UNKNOWN_MEMBER' })
    expect((await grant(guild.id, member.id)).json()).toMatchObject({ code: 'INVALID_ROLE' })
  })

  it('takes the permissions away when the role is deleted', async () => {
    const role = await createRole({ permissions: perms(Permission.ManageChannels) })
    await grant(role.id, member.id)
    await call(owner, 'DELETE', `/guilds/${guild.id}/roles/${role.id}`)

    const response = await call(member, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'x',
    })
    expect(response.statusCode).toBe(403)
  })
})

describe('permissions in practice', () => {
  it('lets a role manage channels', async () => {
    const role = await createRole({ permissions: perms(Permission.ManageChannels) })
    expect(
      (await call(member, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'x' }))
        .statusCode,
    ).toBe(403)

    await grant(role.id, member.id)

    expect(
      (await call(member, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'x' }))
        .statusCode,
    ).toBe(201)
  })

  it('makes a channel private to a role', async () => {
    const staff = await createRole({ name: 'Staff' })
    await grant(staff.id, member.id)
    const created = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'staff',
    })
    const privateId = created.json().data.channel.id

    await call(owner, 'PUT', `/channels/${privateId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: perms(Permission.ViewChannel),
    })
    await call(owner, 'PUT', `/channels/${privateId}/permissions/${staff.id}`, {
      targetType: 'role',
      allow: perms(Permission.ViewChannel),
      deny: '0',
    })

    expect(await visibleChannelIds(member)).toContain(privateId)
    expect(await visibleChannelIds(other)).not.toContain(privateId)
    expect((await call(other, 'GET', `/channels/${privateId}`)).statusCode).toBe(404)
    expect((await call(other, 'GET', `/channels/${privateId}/messages`)).statusCode).toBe(404)
    expect(
      (await call(other, 'POST', `/channels/${privateId}/messages`, { content: 'hi' })).statusCode,
    ).toBe(404)
    expect(
      (await call(member, 'POST', `/channels/${privateId}/messages`, { content: 'hi' })).statusCode,
    ).toBe(201)
  })

  it('lets a channel allow what @everyone denies', async () => {
    await call(owner, 'PATCH', `/guilds/${guild.id}/roles/${guild.id}`, {
      permissions: String(DEFAULT_EVERYONE_PERMISSIONS & ~Permission.SendMessages),
    })
    await call(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: perms(Permission.SendMessages),
      deny: '0',
    })

    expect(
      (await call(member, 'POST', `/channels/${textId}/messages`, { content: 'hi' })).statusCode,
    ).toBe(201)
    expect(
      (await call(other, 'POST', `/channels/${textId}/messages`, { content: 'hi' })).statusCode,
    ).toBe(403)
  })

  it('lets moderators delete other people’s messages', async () => {
    const message = (
      await call(other, 'POST', `/channels/${textId}/messages`, { content: 'spam' })
    ).json().data.message
    expect(
      (await call(member, 'DELETE', `/channels/${textId}/messages/${message.id}`)).statusCode,
    ).toBe(403)

    const mods = await createRole({ permissions: perms(Permission.ManageMessages) })
    await grant(mods.id, member.id)

    expect(
      (await call(member, 'DELETE', `/channels/${textId}/messages/${message.id}`)).statusCode,
    ).toBe(204)
  })

  it('gives administrators everything except deleting or giving away the server', async () => {
    const admins = await createRole({ permissions: perms(Permission.Administrator) })
    await grant(admins.id, member.id)

    expect(
      (await call(member, 'PATCH', `/guilds/${guild.id}`, { name: 'Admin was here' })).statusCode,
    ).toBe(200)
    expect((await call(member, 'GET', `/guilds/${guild.id}/invites`)).statusCode).toBe(200)
    expect((await call(member, 'DELETE', `/guilds/${guild.id}`)).statusCode).toBe(403)
    expect(
      (await call(member, 'POST', `/guilds/${guild.id}/transfer`, { userId: member.id }))
        .statusCode,
    ).toBe(403)
  })
})

describe('channel permission overwrites', () => {
  it('require MANAGE_ROLES and cannot grant what the caller lacks', async () => {
    const body = { targetType: 'role', allow: perms(Permission.ViewChannel), deny: '0' }
    expect(
      (await call(member, 'PUT', `/channels/${textId}/permissions/${guild.id}`, body)).statusCode,
    ).toBe(403)

    const managers = await createRole({ permissions: perms(Permission.ManageRoles) })
    await grant(managers.id, member.id)
    expect(
      (await call(member, 'PUT', `/channels/${textId}/permissions/${guild.id}`, body)).statusCode,
    ).toBe(200)
    const tooMuch = await call(member, 'PUT', `/channels/${textId}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: perms(Permission.ManageMessages),
      deny: '0',
    })
    expect(tooMuch.statusCode).toBe(403)
  })

  it("can't lift what the caller couldn't grant, or reach above the caller", async () => {
    const managers = await createRole({ permissions: perms(Permission.ManageRoles), name: 'mods' })
    await grant(managers.id, member.id)
    const seniors = await createRole({ name: 'seniors' })
    await call(owner, 'PATCH', `/guilds/${guild.id}/roles`, [
      { id: managers.id, position: 1 },
      { id: seniors.id, position: 2 },
    ])
    // The owner shuts the managers out of ManageMessages here.
    await call(owner, 'PUT', `/channels/${textId}/permissions/${managers.id}`, {
      targetType: 'role',
      allow: '0',
      deny: perms(Permission.ManageMessages),
    })

    const lifted = await call(member, 'PUT', `/channels/${textId}/permissions/${managers.id}`, {
      targetType: 'role',
      allow: '0',
      deny: '0',
    })
    expect(lifted.statusCode).toBe(403)
    const removed = await call(member, 'DELETE', `/channels/${textId}/permissions/${managers.id}`)
    expect(removed.statusCode).toBe(403)

    const above = await call(member, 'PUT', `/channels/${textId}/permissions/${seniors.id}`, {
      targetType: 'role',
      allow: '0',
      deny: perms(Permission.ViewChannel),
    })
    expect(above.statusCode).toBe(403)
    const self = await call(member, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: perms(Permission.ViewChannel),
      deny: '0',
    })
    expect(self.statusCode).toBe(403)
  })

  it('are returned with the channel and can be removed', async () => {
    await call(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: perms(Permission.SendMessages),
    })
    const channel = (await call(owner, 'GET', `/channels/${textId}`)).json().data.channel
    expect(channel.permissionOverwrites).toEqual([
      {
        targetType: 'member',
        targetId: member.id,
        allow: '0',
        deny: perms(Permission.SendMessages),
      },
    ])

    expect(
      (await call(owner, 'DELETE', `/channels/${textId}/permissions/${member.id}`)).statusCode,
    ).toBe(204)
    expect(
      (await call(member, 'POST', `/channels/${textId}/messages`, { content: 'hi' })).statusCode,
    ).toBe(201)
  })

  it('reject unknown targets', async () => {
    const response = await call(owner, 'PUT', `/channels/${textId}/permissions/123`, {
      targetType: 'role',
      allow: '0',
      deny: '0',
    })
    expect(response.json()).toMatchObject({ code: 'UNKNOWN_TARGET' })
  })

  it('can be synced with the category again', async () => {
    const category = guild.channels.find((c) => c.type === 'category')?.id as string
    await call(owner, 'PUT', `/channels/${category}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: perms(Permission.SendMessages),
    })
    await call(owner, 'PUT', `/channels/${textId}/permissions/${member.id}`, {
      targetType: 'member',
      allow: perms(Permission.SendMessages),
      deny: '0',
    })

    expect((await call(member, 'POST', `/channels/${textId}/sync`)).statusCode).toBe(403)
    const synced = await call(owner, 'POST', `/channels/${textId}/sync`)
    expect(synced.statusCode).toBe(200)
    expect(synced.json().data.channel.permissionOverwrites).toEqual([
      { targetType: 'role', targetId: guild.id, allow: '0', deny: perms(Permission.SendMessages) },
    ])

    const voiceId = guild.channels.find((c) => c.type === 'voice')?.id as string
    const topLevel = await call(owner, 'PATCH', `/channels/${voiceId}`, { parentId: null })
    expect(topLevel.statusCode).toBe(200)
    expect((await call(owner, 'POST', `/channels/${voiceId}/sync`)).json().code).toBe('NO_CATEGORY')
  })

  it('are inherited by new channels in a category', async () => {
    const category = guild.channels.find((c) => c.type === 'category')?.id as string
    await call(owner, 'PUT', `/channels/${category}/permissions/${guild.id}`, {
      targetType: 'role',
      allow: '0',
      deny: perms(Permission.SendMessages),
    })

    const created = await call(owner, 'POST', `/guilds/${guild.id}/channels`, {
      type: 'text',
      name: 'inside',
      parentId: category,
    })
    expect(created.json().data.channel.permissionOverwrites).toEqual([
      expect.objectContaining({ targetId: guild.id, deny: perms(Permission.SendMessages) }),
    ])
  })
})
