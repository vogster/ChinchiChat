import { PINS_PER_CHANNEL_MAX } from '@chinchi/shared'
import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let outsider: TestActor
let textId: string

const send = async (content: string) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
    payload: { content },
  })
  return response.json().data.message.id as string
}

const pin = (actor: TestActor, messageId: string, method: 'PUT' | 'DELETE' = 'PUT') =>
  app.inject({
    method,
    url: `/api/v1/channels/${textId}/pins/${messageId}`,
    headers: actor.headers,
  })

const pins = async (actor: TestActor) => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/channels/${textId}/pins`,
    headers: actor.headers,
  })
  return response
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
})

afterAll(async () => {
  await close()
})

describe('pins', () => {
  it('pins a message, announces it and lists pins newest first', async () => {
    const first = await send('first')
    const second = await send('second')

    expect((await pin(owner, first)).statusCode).toBe(204)
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_UPDATE',
      data: { id: first, pinned: true },
    })
    await pin(owner, second)

    const response = await pins(member)
    expect(response.statusCode).toBe(200)
    expect(response.json().data.messages.map((m: { id: string }) => m.id)).toEqual([second, first])
    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/channels/${textId}/messages`,
      headers: member.headers,
    })
    expect(history.json().data.messages.map((m: { pinned: boolean }) => m.pinned)).toEqual([
      true,
      true,
    ])
  })

  it('unpins, and pinning twice changes nothing', async () => {
    const id = await send('note')
    await pin(owner, id)
    events.clear()
    expect((await pin(owner, id)).statusCode).toBe(204)
    expect(events.published).toHaveLength(0)

    expect((await pin(owner, id, 'DELETE')).statusCode).toBe(204)
    expect(events.published.at(-1)).toMatchObject({ data: { id, pinned: false } })
    expect((await pins(owner)).json().data.messages).toEqual([])
  })

  it('needs MANAGE_MESSAGES', async () => {
    const id = await send('note')
    const response = await pin(member, id)
    expect(response.statusCode).toBe(403)
    expect(response.json().code).toBe('MISSING_PERMISSIONS')
  })

  it('hides pins from outsiders', async () => {
    expect((await pins(outsider)).statusCode).toBe(404)
  })

  it('never lets concurrent pins pass the limit', async () => {
    await db.execute(sql`
      insert into messages (id, channel_id, author_id, content, pinned_at)
      select 1000 + n, ${textId}, ${owner.id}, 'old', now()
      from generate_series(1, ${PINS_PER_CHANNEL_MAX - 1}) n
    `)
    const ids = await Promise.all([send('a'), send('b'), send('c')])
    const results = await Promise.all(ids.map((id) => pin(owner, id)))
    expect(results.filter((r) => r.statusCode === 204)).toHaveLength(1)
  })

  it(`allows at most ${PINS_PER_CHANNEL_MAX} pins per channel`, async () => {
    const id = await send('one more')
    await db.execute(sql`
      insert into messages (id, channel_id, author_id, content, pinned_at)
      select 1000 + n, ${textId}, ${owner.id}, 'old', now()
      from generate_series(1, ${PINS_PER_CHANNEL_MAX}) n
    `)
    const response = await pin(owner, id)
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('TOO_MANY_PINS')
  })
})
