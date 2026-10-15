import { Permission, REACTIONS_PER_MESSAGE_MAX } from '@chinchi/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

// Many reactions in a row: the per-user rate limit has its own tests.
const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guildId: string
let textId: string
let messageId: string

const EMOJI = [...'😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜']

const reactionUrl = (emoji: string, who = '@me', message = messageId) =>
  `/api/v1/channels/${textId}/messages/${message}/reactions/${encodeURIComponent(emoji)}/${who}`

const react = (actor: TestActor, emoji: string, method: 'PUT' | 'DELETE' = 'PUT', who = '@me') =>
  app.inject({ method, url: reactionUrl(emoji, who), headers: actor.headers })

const reactionsSeenBy = async (actor: TestActor) => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/channels/${textId}/messages`,
    headers: actor.headers,
  })
  const message = response.json().data.messages.find((m: { id: string }) => m.id === messageId) as {
    reactions: unknown
  }
  return message.reactions
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, owner)
  guildId = guild.id
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guildId, member.id)
  const sent = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
    payload: { content: 'react to me' },
  })
  messageId = sent.json().data.message.id
})

afterAll(async () => {
  await close()
})

describe('reactions', () => {
  it('adds a reaction once, shows who reacted and broadcasts it', async () => {
    expect((await react(member, '👍')).statusCode).toBe(204)
    expect((await react(member, '👍')).statusCode).toBe(204)

    expect(await reactionsSeenBy(member)).toEqual([{ emoji: '👍', count: 1, me: true }])
    expect(await reactionsSeenBy(owner)).toEqual([{ emoji: '👍', count: 1, me: false }])
    const added = events.published.filter((e) => e.type === 'MESSAGE_REACTION_ADD')
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({
      data: { channelId: textId, guildId, messageId, userId: member.id, emoji: '👍' },
    })
  })

  it('keeps reactions in the order they first appeared, with counts', async () => {
    await react(member, '🎉')
    await react(owner, '👍')
    await react(owner, '🎉')

    expect(await reactionsSeenBy(owner)).toEqual([
      { emoji: '🎉', count: 2, me: true },
      { emoji: '👍', count: 1, me: true },
    ])
  })

  it('accepts the longest emoji sequences in the URL', async () => {
    const kiss = '🧑🏻‍❤️‍💋‍🧑🏼'
    expect((await react(member, kiss)).statusCode).toBe(204)
    expect(await reactionsSeenBy(member)).toEqual([{ emoji: kiss, count: 1, me: true }])
  })

  it('never lets concurrent requests pass the emoji limit', async () => {
    for (const emoji of EMOJI.slice(0, REACTIONS_PER_MESSAGE_MAX - 1)) await react(owner, emoji)
    const results = await Promise.all(
      EMOJI.slice(REACTIONS_PER_MESSAGE_MAX - 1, REACTIONS_PER_MESSAGE_MAX + 2).map((emoji) =>
        react(owner, emoji),
      ),
    )
    expect(results.filter((r) => r.statusCode === 204)).toHaveLength(1)
    expect((await reactionsSeenBy(owner)) as unknown[]).toHaveLength(REACTIONS_PER_MESSAGE_MAX)
  })

  it('shows my reactions in the response to my own edit', async () => {
    await react(owner, '👍')
    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${textId}/messages/${messageId}`,
      headers: owner.headers,
      payload: { content: 'edited' },
    })
    expect(edited.json().data.message.reactions).toEqual([{ emoji: '👍', count: 1, me: true }])
  })

  it('removes your own reaction', async () => {
    await react(member, '👍🏽')
    expect((await react(member, '👍🏽', 'DELETE')).statusCode).toBe(204)

    expect(await reactionsSeenBy(member)).toEqual([])
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_REACTION_REMOVE',
      data: { userId: member.id, emoji: '👍🏽' },
    })
  })

  it('lists who reacted', async () => {
    await react(member, '❤️')
    await react(owner, '❤️')
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/channels/${textId}/messages/${messageId}/reactions/${encodeURIComponent('❤️')}`,
      headers: owner.headers,
    })
    expect(response.json().data.users.map((u: { id: string }) => u.id)).toEqual([
      member.id,
      owner.id,
    ])
  })

  it.each(['a', '👍👍', ':thumbsup:'])('rejects %j as an emoji', async (emoji) => {
    const response = await react(member, emoji)
    expect(response.statusCode).toBe(400)
  })

  it('needs ADD_REACTIONS for a new emoji, but anyone can join an existing one', async () => {
    await react(owner, '👍')
    await app.inject({
      method: 'PUT',
      url: `/api/v1/channels/${textId}/permissions/${guildId}`,
      headers: owner.headers,
      payload: { targetType: 'role', allow: '0', deny: String(Permission.AddReactions) },
    })

    const fresh = await react(member, '🔥')
    expect(fresh.statusCode).toBe(403)
    expect(fresh.json().code).toBe('MISSING_PERMISSIONS')
    expect((await react(member, '👍')).statusCode).toBe(204)
  })

  it(`caps a message at ${REACTIONS_PER_MESSAGE_MAX} different emoji`, async () => {
    for (const emoji of EMOJI.slice(0, REACTIONS_PER_MESSAGE_MAX)) {
      expect((await react(owner, emoji)).statusCode).toBe(204)
    }
    const over = await react(owner, EMOJI[REACTIONS_PER_MESSAGE_MAX] as string)
    expect(over.statusCode).toBe(400)
    expect(over.json().code).toBe('TOO_MANY_REACTIONS')
  })

  it('lets moderators remove reactions of others', async () => {
    await react(member, '💩')
    expect((await react(member, '💩', 'DELETE', owner.id)).statusCode).toBe(403)
    expect((await react(owner, '💩', 'DELETE', member.id)).statusCode).toBe(204)
    expect(await reactionsSeenBy(member)).toEqual([])
  })

  it('hides messages of servers you are not in', async () => {
    expect((await react(outsider, '👍')).statusCode).toBe(404)
  })

  it('answers 404 for a message that does not exist', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: reactionUrl('👍', '@me', '123456789'),
      headers: member.headers,
    })
    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe('UNKNOWN_MESSAGE')
  })
})
