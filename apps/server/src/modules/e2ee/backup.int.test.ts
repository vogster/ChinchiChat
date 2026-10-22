import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, close } = createTestApp()

let alice: TestActor
let bob: TestActor
let outsider: TestActor

const b64 = (bytes = 48) => randomBytes(bytes).toString('base64')
const ed25519 = () => {
  const { publicKey } = generateKeyPairSync('ed25519')
  return Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString(
    'base64',
  )
}
const call = (
  actor: TestActor,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url: `/api/v1${url}`,
    headers: actor.headers,
    ...(payload ? { payload } : {}),
  })

/** A recovery reset: a new user key (with the password), then a new backup. */
const startOver = async (actor: TestActor) => {
  await call(actor, 'PUT', '/users/@me/e2ee/user-key', {
    publicKey: ed25519(),
    replace: true,
    password: 'password123',
  })
  return call(actor, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92), replace: true })
}

const encryptedDm = async () =>
  (
    await call(alice, 'POST', '/users/@me/channels', { recipientIds: [bob.id], encrypted: true })
  ).json().data.channel as { id: string }

const send = async (channelId: string) =>
  (await call(alice, 'POST', `/channels/${channelId}/messages`, { ciphertext: b64() })).json().data
    .message as { id: string }

beforeAll(async () => {
  await app.listen({ host: '127.0.0.1', port: 0 })
})

beforeEach(async () => {
  await resetState(db, redis)
  alice = await signUp(app, { username: 'alice', email: 'alice@example.com' })
  bob = await signUp(app, { username: 'bob', email: 'bob@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  const guild = await createGuild(app, alice)
  await addMember(db, guild.id, bob.id)
})

afterAll(close)

describe('history backups', () => {
  it('are created once (replaced only on purpose), and only their owner sees them', async () => {
    expect((await call(alice, 'GET', '/users/@me/e2ee/backup')).json().data.backup).toBeNull()
    const userKey = b64(92)

    const created = (await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey })).json().data
      .backup
    expect(created).toMatchObject({ version: expect.any(String), userKey })
    const again = await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })
    expect(again.json().code).toBe('BACKUP_EXISTS')

    expect((await call(alice, 'GET', '/users/@me/e2ee/backup')).json().data.backup).toEqual(created)
    expect((await call(bob, 'GET', '/users/@me/e2ee/backup')).json().data.backup).toBeNull()
  })

  it('keep entries of my own conversations, a page at a time per conversation', async () => {
    const { version } = (
      await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })
    ).json().data.backup
    const channel = await encryptedDm()
    const [first, second, third] = [
      await send(channel.id),
      await send(channel.id),
      await send(channel.id),
    ]
    const entries = [first, second, third].map((m) => ({ messageId: m.id, payload: b64(64) }))

    const stored = await call(alice, 'POST', '/users/@me/e2ee/backup/entries', { version, entries })
    expect(stored.statusCode).toBe(204)

    const page = await call(
      alice,
      'GET',
      `/users/@me/e2ee/backup/entries?channelId=${channel.id}&limit=2`,
    )
    expect(page.json().data.entries).toEqual([
      { messageId: first.id, channelId: channel.id, payload: entries[0]?.payload },
      { messageId: second.id, channelId: channel.id, payload: entries[1]?.payload },
    ])
    const rest = await call(
      alice,
      'GET',
      `/users/@me/e2ee/backup/entries?channelId=${channel.id}&after=${second.id}`,
    )
    expect(rest.json().data.entries.map((e: { messageId: string }) => e.messageId)).toEqual([
      third.id,
    ])
    // Bob has no backup of his own; Alice's entries are hers alone.
    const bobs = await call(bob, 'GET', `/users/@me/e2ee/backup/entries?channelId=${channel.id}`)
    expect(bobs.json().data.entries).toEqual([])
  })

  it('is replaced only along with a new user key (which takes the password)', async () => {
    const userKey = (key: string, replace = false) =>
      call(alice, 'PUT', '/users/@me/e2ee/user-key', {
        publicKey: key,
        ...(replace ? { replace: true, password: 'password123' } : {}),
      })
    await userKey(ed25519())
    await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })

    // A stolen session can't wipe the history backup by starting a new one.
    const alone = await call(alice, 'PUT', '/users/@me/e2ee/backup', {
      userKey: b64(92),
      replace: true,
    })
    expect(alone.statusCode).toBe(403)
    expect(alone.json().code).toBe('BACKUP_KEY_UNCHANGED')

    await userKey(ed25519(), true)
    const fresh = await call(alice, 'PUT', '/users/@me/e2ee/backup', {
      userKey: b64(92),
      replace: true,
    })
    expect(fresh.statusCode).toBe(200)
  })

  it('refuse entries for an old backup or a conversation I am not in', async () => {
    const { version } = (
      await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })
    ).json().data.backup
    const channel = await encryptedDm()
    const message = await send(channel.id)
    await call(outsider, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })
    const theirs = (await call(outsider, 'GET', '/users/@me/e2ee/backup')).json().data.backup

    const foreign = await call(outsider, 'POST', '/users/@me/e2ee/backup/entries', {
      version: theirs.version,
      entries: [{ messageId: message.id, payload: b64() }],
    })
    expect(foreign.statusCode).toBe(404)

    await startOver(alice)
    const stale = await call(alice, 'POST', '/users/@me/e2ee/backup/entries', {
      version,
      entries: [{ messageId: message.id, payload: b64() }],
    })
    expect(stale.json().code).toBe('STALE_BACKUP')
  })

  it('lose entries with a new backup and with deleted messages', async () => {
    const { version } = (
      await call(alice, 'PUT', '/users/@me/e2ee/backup', { userKey: b64(92) })
    ).json().data.backup
    const channel = await encryptedDm()
    const kept = await send(channel.id)
    const deleted = await send(channel.id)
    await call(alice, 'POST', '/users/@me/e2ee/backup/entries', {
      version,
      entries: [kept, deleted].map((m) => ({ messageId: m.id, payload: b64() })),
    })
    const list = async () =>
      (await call(alice, 'GET', `/users/@me/e2ee/backup/entries?channelId=${channel.id}`)).json()
        .data.entries as { messageId: string }[]

    await call(alice, 'DELETE', `/channels/${channel.id}/messages/${deleted.id}`)
    expect((await list()).map((e) => e.messageId)).toEqual([kept.id])

    await startOver(alice)
    expect(await list()).toEqual([])
  })
})
