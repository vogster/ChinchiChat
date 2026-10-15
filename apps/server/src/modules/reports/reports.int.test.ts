import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let mod: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = async (actor: TestActor, channelId: string, content: string) =>
  (await api(actor, 'POST', `/channels/${channelId}/messages`, { content })).json().data.message
    .id as string

const report = (actor: TestActor, channelId: string, messageId: string, reason = 'spam') =>
  api(actor, 'POST', `/channels/${channelId}/messages/${messageId}/report`, {
    reason,
    details: 'реклама казино',
  })

const g = () => `/guilds/${guild.id}`

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  mod = await signUp(app, { username: 'mod', email: 'mod@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, mod.id)
  await addMember(db, guild.id, member.id)
  const roleId = (
    await api(owner, 'POST', `${g()}/roles`, {
      name: 'mods',
      permissions: Permission.ManageMessages.toString(),
    })
  ).json().data.role.id
  await api(owner, 'PUT', `${g()}/members/${mod.id}/roles/${roleId}`)
})

afterAll(async () => {
  await close()
})

describe('reporting a server message', () => {
  it('reaches the moderators with a copy of the message, once per reporter', async () => {
    const messageId = await send(member, textId, 'купи казино')
    expect((await report(mod, textId, messageId)).statusCode).toBe(204)
    expect((await report(mod, textId, messageId)).statusCode).toBe(204)
    expect((await report(owner, textId, messageId, 'harassment')).statusCode).toBe(204)

    // The author deleting the message doesn't erase the evidence.
    await api(member, 'DELETE', `/channels/${textId}/messages/${messageId}`)

    const listed = await api(mod, 'GET', `${g()}/reports`)
    expect(listed.statusCode).toBe(200)
    const reports = listed.json().data.reports
    expect(reports).toHaveLength(2)
    expect(reports[1]).toMatchObject({
      messageId,
      channelId: textId,
      guildId: guild.id,
      content: 'купи казино',
      author: { id: member.id },
      reporter: { id: mod.id },
      reason: 'spam',
      details: 'реклама казино',
      status: 'open',
      resolvedBy: null,
    })
  })

  it("can't report your own message or one you can't see", async () => {
    const own = await send(member, textId, 'моё')
    const response = await report(member, textId, own)
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('CANNOT_REPORT_OWN')

    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })
    expect((await report(outsider, textId, own)).statusCode).toBe(404)
  })

  it('is closed by moderators, and only they see the list', async () => {
    const messageId = await send(member, textId, 'плохое')
    await report(owner, textId, messageId)
    const [open] = (await api(mod, 'GET', `${g()}/reports`)).json().data.reports

    const closed = await api(mod, 'PATCH', `${g()}/reports/${open.id}`, { status: 'resolved' })
    expect(closed.statusCode).toBe(200)
    expect(closed.json().data.report).toMatchObject({
      status: 'resolved',
      resolvedBy: { id: mod.id },
    })
    expect((await api(mod, 'GET', `${g()}/reports`)).json().data.reports).toEqual([])
    expect(
      (await api(mod, 'GET', `${g()}/reports?status=resolved`)).json().data.reports,
    ).toHaveLength(1)

    expect((await api(member, 'GET', `${g()}/reports`)).statusCode).toBe(403)
  })
})

describe('reports about a moderator', () => {
  it("are kept from that moderator, who can't close them either", async () => {
    const messageId = await send(mod, textId, 'грубость модератора')
    await report(member, textId, messageId, 'harassment')

    expect((await api(mod, 'GET', `${g()}/reports`)).json().data.reports).toEqual([])
    const [seen] = (await api(owner, 'GET', `${g()}/reports`)).json().data.reports
    expect(seen).toMatchObject({ author: { id: mod.id } })
    const closing = await api(mod, 'PATCH', `${g()}/reports/${seen.id}`, { status: 'dismissed' })
    expect(closing.statusCode).toBe(404)
  })
})

describe('reporting a direct message', () => {
  it('goes to the instance admins', async () => {
    const dm = (await api(member, 'POST', '/users/@me/channels', { recipientIds: [mod.id] })).json()
      .data.channel
    const messageId = await send(member, dm.id, 'личная гадость')
    expect((await report(mod, dm.id, messageId, 'harassment')).statusCode).toBe(204)

    // owner registered first, so runs the instance.
    const listed = (await api(owner, 'GET', '/admin/reports')).json().data.reports
    expect(listed).toEqual([
      expect.objectContaining({ guildId: null, content: 'личная гадость', reason: 'harassment' }),
    ])
    const closed = await api(owner, 'PATCH', `/admin/reports/${listed[0].id}`, {
      status: 'dismissed',
    })
    expect(closed.json().data.report.status).toBe('dismissed')

    // Server moderators never see DM reports.
    expect((await api(mod, 'GET', `${g()}/reports`)).json().data.reports).toEqual([])
  })
})
