import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()
const sockets: TestSocket[] = []

let owner: TestActor
let member: TestActor
let other: TestActor
let outsider: TestActor
let guildId: string
let textId: string

interface SentMessage {
  id: string
  mentions: { users: string[]; roles: string[]; everyone: boolean; here: boolean }
}

const send = async (actor: TestActor, payload: object): Promise<SentMessage> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: actor.headers,
    payload,
  })
  expect(response.statusCode).toBe(201)
  return response.json().data.message
}

const createRole = async (body: object) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${guildId}/roles`,
    headers: owner.headers,
    payload: body,
  })
  return response.json().data.role.id as string
}

const giveRole = (userId: string, roleId: string) =>
  app.inject({
    method: 'PUT',
    url: `/api/v1/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    headers: owner.headers,
  })

const mentionCounts = async (actor: TestActor) => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/users/@me/read-states',
    headers: actor.headers,
  })
  return response.json().data.mentionCounts as Record<string, number>
}

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  other = await signUp(app, { username: 'other', email: 'other@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, owner)
  guildId = guild.id
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guildId, member.id)
  await addMember(db, guildId, other.id)
})

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.close()
})

afterAll(async () => {
  await close()
})

describe('resolving mentions', () => {
  it('keeps members, drops outsiders, unknown ids and the author', async () => {
    const message = await send(member, {
      content: `<@${owner.id}> <@${outsider.id}> <@123456789> <@${member.id}> <@${owner.id}>`,
    })
    expect(message.mentions).toEqual({ users: [owner.id], roles: [], everyone: false, here: false })
  })

  it('lets anyone mention mentionable roles, others only with MENTION_EVERYONE', async () => {
    const open = await createRole({ name: 'Open', mentionable: true })
    const closed = await createRole({ name: 'Closed', mentionable: false })

    const byMember = await send(member, { content: `<@&${open}> <@&${closed}> <@&999>` })
    expect(byMember.mentions.roles).toEqual([open])

    const byOwner = await send(owner, { content: `<@&${open}> <@&${closed}>` })
    expect(byOwner.mentions.roles).toEqual([open, closed])
  })

  it('needs MENTION_EVERYONE for @everyone', async () => {
    expect((await send(member, { content: '@everyone hi' })).mentions.everyone).toBe(false)
    expect((await send(owner, { content: '@everyone hi' })).mentions.everyone).toBe(true)
  })

  it('needs MENTION_EVERYONE for @here, kept as a flag rather than a member list', async () => {
    expect((await send(member, { content: '@here hi' })).mentions.here).toBe(false)
    expect((await send(owner, { content: '@here standup' })).mentions).toEqual({
      users: [],
      roles: [],
      everyone: false,
      here: true,
    })
  })

  it('notifies the author of a replied-to message unless asked not to', async () => {
    const original = await send(member, { content: 'question' })

    const loud = await send(other, { content: 'answer', replyTo: original.id })
    expect(loud.mentions.users).toEqual([member.id])

    const quiet = await send(other, { content: 'a', replyTo: original.id, replyMention: false })
    expect(quiet.mentions.users).toEqual([])
  })

  it('updates mentions when a message is edited', async () => {
    const message = await send(owner, { content: 'hi' })
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${textId}/messages/${message.id}`,
      headers: owner.headers,
      payload: { content: `hi <@${member.id}>` },
    })
    expect(edited.json().data.message.mentions.users).toEqual([member.id])
  })

  it('ignores mentions inside code', async () => {
    const message = await send(owner, {
      content: `\`<@${member.id}>\` and @everyone in \`\`\`x\`\`\``,
    })
    expect(message.mentions).toEqual({ users: [], roles: [], everyone: true, here: false })
  })
})

describe('mention counts', () => {
  it('counts unread mentions of me, my roles and everyone, until I read them', async () => {
    const team = await createRole({ name: 'Team', mentionable: true })
    await giveRole(member.id, team)

    // Sending marks the channel read for the author, so this comes first.
    await send(member, { content: `<@${member.id}> talking to myself` })
    await send(owner, { content: `<@${member.id}>` })
    await send(owner, { content: `<@&${team}>` })
    const last = await send(owner, { content: '@everyone' })
    await send(owner, { content: `<@${other.id}>` })

    expect(await mentionCounts(member)).toEqual({ [textId]: 3 })
    expect(await mentionCounts(other)).toEqual({ [textId]: 2 })
    expect(await mentionCounts(owner)).toEqual({})

    await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/messages/${last.id}/ack`,
      headers: member.headers,
    })
    expect(await mentionCounts(member)).toEqual({})
    expect(events.published.at(-1)).toMatchObject({
      type: 'CHANNEL_ACK',
      data: { channelId: textId, mentionCount: 0 },
    })
  })

  it('counts @here like @everyone', async () => {
    await send(owner, { content: '@here' })
    expect(await mentionCounts(member)).toEqual({ [textId]: 1 })
  })

  it('does not count mentions from before joining the server', async () => {
    await send(owner, { content: '@everyone welcome, old news' })
    const newcomer = await signUp(app, { username: 'newcomer', email: 'newcomer@example.com' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await addMember(db, guildId, newcomer.id)

    expect(await mentionCounts(newcomer)).toEqual({})
    await send(owner, { content: '@everyone fresh news' })
    expect(await mentionCounts(newcomer)).toEqual({ [textId]: 1 })
  })

  it('includes mention counts in READY', async () => {
    await send(owner, { content: `<@${member.id}>` })
    const { socket, ready } = await identify(app, member.cookie)
    sockets.push(socket)

    expect((ready as unknown as { mentionCounts: unknown }).mentionCounts).toEqual({ [textId]: 1 })
  })
})
