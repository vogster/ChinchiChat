import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { identify } from '../../../test/gateway-client'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestSocket } from '../../../test/gateway-client'
import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()
const sockets: TestSocket[] = []

let alice: TestActor
let bob: TestActor
let channelId: string

const call = (actor: TestActor, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const createPoll = async (poll: object, content = '') =>
  (await call(alice, 'POST', `/channels/${channelId}/messages`, { content, poll })).json().data
    .message as { id: string; poll: Record<string, unknown> }

const vote = (actor: TestActor, messageId: string, answerIds: number[]) =>
  call(actor, 'PUT', `/channels/${channelId}/polls/${messageId}/answers/@me`, { answerIds })

const votersOf = (actor: TestActor, messageId: string, answerId: number, query = '') =>
  call(actor, 'GET', `/channels/${channelId}/polls/${messageId}/answers/${answerId}/voters${query}`)

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
  channelId = guild.channels.find((c: { type: string }) => c.type === 'text')?.id as string
})

afterAll(async () => {
  for (const socket of sockets) socket.close()
  await close()
})

describe('polls', () => {
  it('come with their message: question, answers, and an end a day away', async () => {
    const message = await createPoll({ question: 'Куда идём?', answers: ['Кино', 'Бар'] })

    expect(message.poll).toMatchObject({
      question: 'Куда идём?',
      multiple: false,
      ended: false,
      voters: 0,
      answers: [
        { id: 1, text: 'Кино', count: 0, me: false },
        { id: 2, text: 'Бар', count: 0, me: false },
      ],
    })
    const hours = (Date.parse(message.poll.expiresAt as string) - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(23.9)
    const history = (await call(bob, 'GET', `/channels/${channelId}/messages`)).json().data.messages
    expect(history[0].poll.question).toBe('Куда идём?')
  })

  it('count votes, each person once, changeable, and tell everyone the new counts', async () => {
    const message = await createPoll({ question: 'Пицца?', answers: ['Да', 'Нет'] })
    const watcher = (await identify(app, alice.cookie)).socket
    sockets.push(watcher)

    const bobs = await vote(bob, message.id, [1])
    expect(bobs.json().data.poll).toMatchObject({
      voters: 1,
      answers: [
        { id: 1, count: 1, me: true },
        { id: 2, count: 0, me: false },
      ],
    })
    expect(await watcher.dispatch('POLL_UPDATE')).toMatchObject({
      messageId: message.id,
      poll: { voters: 1, answers: [{ count: 1, me: false }, { count: 0 }] },
    })

    await vote(bob, message.id, [2])
    await vote(alice, message.id, [2])
    const history = (await call(alice, 'GET', `/channels/${channelId}/messages`)).json().data
      .messages
    expect(history[0].poll).toMatchObject({
      voters: 2,
      answers: [
        { id: 1, count: 0, me: false },
        { id: 2, count: 2, me: true },
      ],
    })
    // An empty list takes the vote back.
    expect((await vote(bob, message.id, [])).json().data.poll.voters).toBe(1)
  })

  it('take several answers only where allowed, and only existing ones', async () => {
    const single = await createPoll({ question: 'Один?', answers: ['a', 'b', 'c'] })
    const multiple = await createPoll({
      question: 'Много?',
      answers: ['a', 'b', 'c'],
      multiple: true,
    })

    expect((await vote(bob, single.id, [1, 2])).json().code).toBe('POLL_SINGLE_ANSWER')
    expect((await vote(bob, single.id, [4])).json().code).toBe('UNKNOWN_ANSWER')
    const both = await vote(bob, multiple.id, [1, 3])
    expect(both.json().data.poll).toMatchObject({
      voters: 1,
      answers: [{ count: 1 }, { count: 0 }, { count: 1 }],
    })
  })

  it('end early by their author only; after that nobody votes', async () => {
    const message = await createPoll({ question: 'Ещё?', answers: ['Да', 'Нет'], durationHours: 1 })
    const path = `/channels/${channelId}/polls/${message.id}/expire`

    expect((await call(bob, 'POST', path)).json().code).toBe('MISSING_PERMISSIONS')
    const ended = await call(alice, 'POST', path)
    expect(ended.json().data.poll.ended).toBe(true)
    expect((await vote(bob, message.id, [1])).json().code).toBe('POLL_ENDED')
  })

  it('are not for encrypted conversations, nor for messages without one', async () => {
    const dm = (
      await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id], encrypted: true })
    ).json().data.channel as { id: string }
    const encrypted = await call(alice, 'POST', `/channels/${dm.id}/messages`, {
      ciphertext: 'AAAA',
      poll: { question: 'q', answers: ['a', 'b'] },
    })
    expect(encrypted.json().code).toBe('ENCRYPTED_CHANNEL')

    const plain = (
      await call(alice, 'POST', `/channels/${channelId}/messages`, { content: 'просто' })
    ).json().data.message as { id: string; poll: unknown }
    expect(plain.poll).toBeNull()
    expect((await vote(bob, plain.id, [1])).json().code).toBe('UNKNOWN_POLL')
  })

  describe('who voted', () => {
    it('shows a few voters per answer with the poll, and lists them all on request', async () => {
      const message = await createPoll({ question: 'Пицца?', answers: ['Да', 'Нет'] })
      expect(message.poll).toMatchObject({ anonymous: false })
      await vote(alice, message.id, [1])
      const voted = (await vote(bob, message.id, [1])).json().data.poll

      expect(voted.answers[0].sample.map((u: { username: string }) => u.username).sort()).toEqual([
        'alice',
        'bob',
      ])
      expect(voted.answers[1].sample).toEqual([])

      const listed = await votersOf(bob, message.id, 1)
      expect(listed.statusCode).toBe(200)
      const users = listed.json().data.users as { id: string; username: string }[]
      expect(users.map((u) => u.username).sort()).toEqual(['alice', 'bob'])
      // Page by page, after the last id seen.
      const first = (await votersOf(bob, message.id, 1, '?limit=1')).json().data.users
      const next = (await votersOf(bob, message.id, 1, `?limit=1&after=${first[0].id}`)).json().data
        .users
      expect([...first, ...next].map((u: { id: string }) => u.id)).toEqual(users.map((u) => u.id))
    })

    it('stay hidden in an anonymous poll', async () => {
      const message = await createPoll({
        question: 'Тайно?',
        answers: ['Да', 'Нет'],
        anonymous: true,
      })
      const voted = (await vote(bob, message.id, [1])).json().data.poll

      expect(voted).toMatchObject({ anonymous: true, voters: 1 })
      expect(voted.answers[0]).toMatchObject({ count: 1, me: true, sample: [] })
      const listed = await votersOf(alice, message.id, 1)
      expect(listed.statusCode).toBe(403)
      expect(listed.json().code).toBe('POLL_ANONYMOUS')
    })

    it('are only for people who can read the channel, and real answers', async () => {
      const message = await createPoll({ question: 'Пицца?', answers: ['Да', 'Нет'] })
      const outsider = await signUp(app, { username: 'eve', email: 'eve@example.com' })

      expect((await votersOf(outsider, message.id, 1)).statusCode).toBe(404)
      expect((await votersOf(bob, message.id, 7)).json().code).toBe('UNKNOWN_ANSWER')
    })
  })
})
