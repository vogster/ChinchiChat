import { Permission } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { attachments } from '../../db/schema'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string

const api = (actor: TestActor, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const send = async (actor: TestActor, channelId: string, content: string) =>
  (await api(actor, 'POST', `/channels/${channelId}/messages`, { content })).json().data.message
    .id as string

const search = async (actor: TestActor, query: string) => {
  const response = await api(actor, 'GET', `/guilds/${guild.id}/messages/search?${query}`)
  return response
}

const contents = (response: { json: () => { data: { messages: { content: string }[] } } }) =>
  response.json().data.messages.map((m) => m.content)

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('searching a server', () => {
  it('finds words in any form, Russian or English, newest first', async () => {
    await send(owner, textId, 'Мой кот любит рыбу')
    await send(member, textId, 'Коты спят весь день')
    await send(member, textId, 'The dogs are running')
    await send(member, textId, 'ничего общего')

    const cats = await search(member, `q=${encodeURIComponent('кот')}`)
    expect(cats.statusCode).toBe(200)
    expect(contents(cats)).toEqual(['Коты спят весь день', 'Мой кот любит рыбу'])
    expect(cats.json().data.total).toBe(2)
    expect(contents(await search(member, 'q=dog'))).toEqual(['The dogs are running'])
    // Stop words find nothing rather than everything; excluded words go in any form.
    expect(contents(await search(member, 'q=the'))).toEqual([])
    expect(contents(await search(member, `q=${encodeURIComponent('кот -рыбы')}`))).toEqual([
      'Коты спят весь день',
    ])
  })

  it('narrows down by author, channel and kind of content, and pages', async () => {
    await send(owner, textId, 'смотри https://example.com')
    const withFile = await send(member, textId, 'вот файл')
    await db.insert(attachments).values({
      id: '999000',
      channelId: textId,
      uploaderId: member.id,
      messageId: withFile,
      filename: 'cat.png',
      contentType: 'image/png',
      size: 10,
    })
    for (let i = 0; i < 3; i += 1) await send(member, textId, `сообщение ${i}`)

    expect(contents(await search(member, 'has=link'))).toEqual(['смотри https://example.com'])
    expect(contents(await search(member, 'has=image'))).toEqual(['вот файл'])
    expect(contents(await search(member, 'has=file'))).toEqual(['вот файл'])

    const byOwner = await search(member, `authorId=${owner.id}`)
    expect(contents(byOwner)).toEqual(['смотри https://example.com'])

    const first = await search(member, `authorId=${member.id}&limit=2`)
    expect(first.json().data.total).toBe(4)
    expect(contents(first)).toEqual(['сообщение 2', 'сообщение 1'])
    const lastId = first.json().data.messages[1].id
    const next = await search(member, `authorId=${member.id}&limit=2&before=${lastId}`)
    expect(contents(next)).toEqual(['сообщение 0', 'вот файл'])
    expect(next.json().data.total).toBeNull()

    const other = (
      await api(owner, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'другой' })
    ).json().data.channel
    await send(owner, other.id, 'смотри в другом')
    expect(contents(await search(member, `q=смотри&channelId=${other.id}`))).toEqual([
      'смотри в другом',
    ])
  })

  it("never shows messages from channels the searcher can't read", async () => {
    const hidden = (
      await api(owner, 'POST', `/guilds/${guild.id}/channels`, { type: 'text', name: 'тайное' })
    ).json().data.channel
    await api(owner, 'PUT', `/channels/${hidden.id}/permissions/${member.id}`, {
      targetType: 'member',
      allow: '0',
      deny: Permission.ViewChannel.toString(),
    })
    await send(owner, hidden.id, 'секретный план')

    expect(contents(await search(member, `q=${encodeURIComponent('план')}`))).toEqual([])
    expect(contents(await search(owner, `q=${encodeURIComponent('план')}`))).toEqual([
      'секретный план',
    ])
    const direct = await search(member, `q=x&channelId=${hidden.id}`)
    expect(direct.json().data.messages).toEqual([])
  })

  it('needs something to search for, and membership', async () => {
    expect((await search(member, '')).statusCode).toBe(400)
    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })
    expect((await search(outsider, 'q=кот')).statusCode).toBe(404)
  })
})

describe('searching one channel', () => {
  it('works in direct messages for their members only', async () => {
    const dm = (
      await api(member, 'POST', '/users/@me/channels', { recipientIds: [owner.id] })
    ).json().data.channel
    await send(member, dm.id, 'встречаемся у фонтана')

    const found = await api(owner, 'GET', `/channels/${dm.id}/messages/search?q=фонтан`)
    expect(contents(found)).toEqual(['встречаемся у фонтана'])

    const outsider = await signUp(app, { username: 'outsider', email: 'out@example.com' })
    const refused = await api(outsider, 'GET', `/channels/${dm.id}/messages/search?q=фонтан`)
    expect(refused.statusCode).toBe(404)
  })
})
