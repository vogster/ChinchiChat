import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { sendFiles, uploadFile } from '../../../test/attachment-helpers'
import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'
import { readZip } from '../../../test/zip'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()

let owner: TestActor
let member: TestActor
let textId: string

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const say = (actor: TestActor, content: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: actor.headers,
    payload: { content },
  })

const exportOf = (actor: TestActor) =>
  app.inject({ method: 'GET', url: '/api/v1/users/@me/export', headers: actor.headers })

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  const guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
})

describe('data export', () => {
  it('packs the account, my messages and my files into a ZIP', async () => {
    await say(member, 'Мой первый пост')
    await say(owner, 'Чужое сообщение')
    const upload = await uploadFile(app, member, textId, PNG, { filename: 'кот.png' })
    const sent = await sendFiles(app, member, textId, [upload.id])

    const response = await exportOf(member)

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/zip')
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="chinchi-member-\d{4}-\d{2}-\d{2}\.zip"$/,
    )
    const files = readZip(response.rawPayload)

    const account = JSON.parse(files.get('account.json')?.toString() ?? '{}')
    expect(account.user).toMatchObject({ id: member.id, username: 'member' })
    expect(account.servers).toEqual([expect.objectContaining({ name: expect.any(String) })])

    const lines = (files.get('messages.jsonl')?.toString() ?? '').trim().split('\n')
    const messages = lines.map((line) => JSON.parse(line))
    expect(messages.map((m) => m.content)).toEqual(['Мой первый пост', ''])
    expect(messages[0]).toMatchObject({ channel: { id: textId, name: 'general' } })
    expect(messages[1].attachments).toEqual([
      { id: upload.id, filename: 'кот.png', path: `files/${sent.id}/${upload.id}-кот.png` },
    ])
    expect(files.get(`files/${sent.id}/${upload.id}-кот.png`)).toEqual(PNG)
    expect(files.has('README.txt')).toBe(true)
  })

  it('requires signing in', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/users/@me/export' })
    expect(response.statusCode).toBe(401)
  })
})
