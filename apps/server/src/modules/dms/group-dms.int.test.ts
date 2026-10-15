import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

type Actor = TestActor & { readonly username: string }

let alice: Actor
let bob: Actor
let carol: Actor
let dave: Actor
let erin: Actor

const join = async (username: string): Promise<Actor> => ({
  ...(await signUp(app, { username, email: `${username}@example.com` })),
  username,
})

interface GroupView {
  id: string
  type: string
  name: string | null
  ownerId: string | null
  recipients: { id: string }[]
}

const api = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

const befriend = async (a: Actor, b: Actor) => {
  await api(a, 'POST', '/users/@me/relationships', { username: b.username })
  await api(b, 'PUT', `/users/@me/relationships/${a.id}`, { type: 'friend' })
}

const createGroup = async (owner: TestActor, members: TestActor[]) => {
  const response = await api(owner, 'POST', '/users/@me/channels', {
    recipientIds: members.map((m) => m.id),
  })
  expect(response.statusCode).toBe(200)
  return response.json().data.channel as GroupView
}

const ids = (users: { id: string }[]) => users.map((u) => u.id).sort()

const published = (type: string) =>
  events.published.filter((event) => event.type === type).map((event) => event.topic)

beforeEach(async () => {
  await resetState(db, redis)
  alice = await join('alice')
  bob = await join('bob')
  carol = await join('carol')
  dave = await join('dave')
  erin = await join('erin')
  // Alice is friends with Bob and Carol; Bob is also friends with Erin; Dave knows nobody.
  await befriend(alice, bob)
  await befriend(alice, carol)
  await befriend(bob, erin)
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('creating group DMs', () => {
  it('starts a group with friends, owned by its creator', async () => {
    const group = await createGroup(alice, [bob, carol])

    expect(group).toMatchObject({ type: 'group_dm', name: null, ownerId: alice.id })
    expect(ids(group.recipients)).toEqual(ids([bob, carol]))
    expect(published('PRIVATE_CHANNEL_CREATE').sort()).toEqual(
      [alice, bob, carol].map((u) => `user:${u.id}`).sort(),
    )
    // Unlike 1:1 DMs, every group is new.
    expect((await createGroup(alice, [bob, carol])).id).not.toBe(group.id)
  })

  it('only takes friends', async () => {
    const response = await api(alice, 'POST', '/users/@me/channels', {
      recipientIds: [bob.id, dave.id],
    })
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('CANNOT_MESSAGE_USER')

    const self = await api(alice, 'POST', '/users/@me/channels', {
      recipientIds: [bob.id, alice.id],
    })
    expect(self.json().code).toBe('INVALID_RECIPIENTS')
  })

  it('lets every member talk', async () => {
    const group = await createGroup(alice, [bob, carol])

    const sent = await api(carol, 'POST', `/channels/${group.id}/messages`, {
      content: `hi <@${bob.id}> and <@${dave.id}>`,
    })

    expect(sent.statusCode).toBe(201)
    expect(sent.json().data.message.mentions.users).toEqual([bob.id])
    expect(published('MESSAGE_CREATE').sort()).toEqual(
      [alice, bob, carol].map((u) => `user:${u.id}`).sort(),
    )
    const outsider = await api(dave, 'GET', `/channels/${group.id}/messages`)
    expect(outsider.statusCode).toBe(404)
  })
})

describe('managing members', () => {
  it('lets members add their friends', async () => {
    const group = await createGroup(alice, [bob, carol])
    await api(alice, 'POST', `/channels/${group.id}/messages`, { content: 'before Erin' })
    events.clear()

    const added = await api(bob, 'PUT', `/channels/${group.id}/recipients/${erin.id}`)

    expect(added.statusCode).toBe(204)
    expect(published('PRIVATE_CHANNEL_CREATE')).toEqual([`user:${erin.id}`])
    expect(published('PRIVATE_CHANNEL_UPDATE').sort()).toEqual(
      [alice, bob, carol].map((u) => `user:${u.id}`).sort(),
    )
    const history = await api(erin, 'GET', `/channels/${group.id}/messages`)
    expect(history.statusCode).toBe(200)
    // Joining doesn't turn the whole history into unread messages.
    const counts = await api(erin, 'GET', '/users/@me/read-states')
    expect(counts.json().data.mentionCounts).toEqual({})

    // Erin is not Alice's friend; Dave is nobody's.
    const notFriend = await api(alice, 'PUT', `/channels/${group.id}/recipients/${dave.id}`)
    expect(notFriend.json().code).toBe('CANNOT_MESSAGE_USER')
    // Adding someone already there changes nothing.
    events.clear()
    expect((await api(alice, 'PUT', `/channels/${group.id}/recipients/${bob.id}`)).statusCode).toBe(
      204,
    )
    expect(events.published).toEqual([])
  })

  it('stops at the size limit', async () => {
    const friends: Actor[] = []
    for (let i = 0; i < 9; i += 1) {
      const friend = await join(`friend${i}`)
      await befriend(alice, friend)
      friends.push(friend)
    }
    const group = await createGroup(alice, friends)

    const full = await api(alice, 'PUT', `/channels/${group.id}/recipients/${bob.id}`)

    expect(full.statusCode).toBe(400)
    expect(full.json().code).toBe('GROUP_DM_FULL')
  })

  it('lets the owner remove people, and anyone leave', async () => {
    const group = await createGroup(alice, [bob, carol])

    const notOwner = await api(bob, 'DELETE', `/channels/${group.id}/recipients/${carol.id}`)
    expect(notOwner.statusCode).toBe(403)
    expect(notOwner.json().code).toBe('MISSING_PERMISSIONS')

    events.clear()
    const removed = await api(alice, 'DELETE', `/channels/${group.id}/recipients/${carol.id}`)
    expect(removed.statusCode).toBe(204)
    expect(published('PRIVATE_CHANNEL_DELETE')).toEqual([`user:${carol.id}`])
    expect(published('PRIVATE_CHANNEL_UPDATE').sort()).toEqual(
      [alice, bob].map((u) => `user:${u.id}`).sort(),
    )
    expect((await api(carol, 'GET', `/channels/${group.id}/messages`)).statusCode).toBe(404)

    const left = await api(bob, 'DELETE', `/channels/${group.id}/recipients/${bob.id}`)
    expect(left.statusCode).toBe(204)
    const list = await api(alice, 'GET', '/users/@me/channels')
    expect(list.json().data.channels[0].recipients).toEqual([])
  })

  it('hands the group on when the owner leaves, and drops it when everyone has', async () => {
    const group = await createGroup(alice, [bob, carol])

    await api(alice, 'DELETE', `/channels/${group.id}/recipients/${alice.id}`)

    const [view] = (await api(bob, 'GET', '/users/@me/channels')).json().data.channels
    expect(view.ownerId).toBe(bob.id)

    await api(bob, 'DELETE', `/channels/${group.id}/recipients/${bob.id}`)
    await api(carol, 'DELETE', `/channels/${group.id}/recipients/${carol.id}`)
    expect((await api(carol, 'GET', '/users/@me/channels')).json().data.channels).toEqual([])
  })

  it('applies only to group DMs the user is in', async () => {
    const group = await createGroup(alice, [bob, carol])
    const dm = (await api(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id] })).json()
      .data.channel as GroupView

    const outsider = await api(dave, 'DELETE', `/channels/${group.id}/recipients/${bob.id}`)
    expect(outsider.statusCode).toBe(404)
    const oneOnOne = await api(alice, 'PUT', `/channels/${dm.id}/recipients/${carol.id}`)
    expect(oneOnOne.statusCode).toBe(400)
    expect(oneOnOne.json().code).toBe('NOT_GROUP_DM')
  })
})

describe('renaming', () => {
  it('lets any member name the group', async () => {
    const group = await createGroup(alice, [bob, carol])
    events.clear()

    const renamed = await api(bob, 'PATCH', `/users/@me/channels/${group.id}`, { name: ' Котики ' })

    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().data.channel.name).toBe('Котики')
    expect(published('PRIVATE_CHANNEL_UPDATE').sort()).toEqual(
      [alice, bob, carol].map((u) => `user:${u.id}`).sort(),
    )
    const cleared = await api(bob, 'PATCH', `/users/@me/channels/${group.id}`, { name: '' })
    expect(cleared.json().data.channel.name).toBeNull()
    const outsider = await api(dave, 'PATCH', `/users/@me/channels/${group.id}`, { name: 'x' })
    expect(outsider.statusCode).toBe(404)
  })
})

describe('system messages in groups', () => {
  it('note who joined, was removed, left, and renamed the group', async () => {
    const group = await createGroup(alice, [bob, carol])
    await api(bob, 'PUT', `/channels/${group.id}/recipients/${erin.id}`)
    await api(alice, 'DELETE', `/channels/${group.id}/recipients/${erin.id}`)
    await api(alice, 'PATCH', `/users/@me/channels/${group.id}`, { name: 'Котики' })
    await api(bob, 'DELETE', `/channels/${group.id}/recipients/${bob.id}`)

    const messages = (await api(alice, 'GET', `/channels/${group.id}/messages`)).json().data
      .messages as {
      id: string
      author: { id: string }
      system: { kind: string; target: { id: string } | null; name: string | null }
    }[]
    expect(messages.map((m) => [m.author.id, m.system])).toEqual([
      [
        bob.id,
        { kind: 'recipient_add', target: expect.objectContaining({ id: erin.id }), name: null },
      ],
      [
        alice.id,
        { kind: 'recipient_remove', target: expect.objectContaining({ id: erin.id }), name: null },
      ],
      [alice.id, { kind: 'rename', target: null, name: 'Котики' }],
      [bob.id, { kind: 'leave', target: null, name: null }],
    ])

    const renamed = messages[2] as { id: string }
    const edit = await api(alice, 'PATCH', `/channels/${group.id}/messages/${renamed.id}`, {
      content: 'подмена',
    })
    expect(edit.statusCode).toBe(403)
  })
})
