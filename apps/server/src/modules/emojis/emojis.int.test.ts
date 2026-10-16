import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp({ env: { RATE_LIMIT: 'off' } })

let owner: TestActor
let member: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let textId: string
let png: Buffer
let gif: Buffer

/** A 3-frame animated GIF, each frame a different colour. */
const animatedGif = () => {
  const [width, height, frames] = [40, 20, 3]
  const raw = Buffer.alloc(width * height * frames * 4)
  for (let pixel = 0; pixel < width * height * frames; pixel++) {
    raw[pixel * 4 + Math.floor(pixel / (width * height))] = 255
    raw[pixel * 4 + 3] = 255
  }
  return sharp(raw, { raw: { width, height: height * frames, channels: 4, pageHeight: height } })
    .gif({ loop: 0, delay: [100, 100, 100] })
    .toBuffer()
}

const upload = (actor: TestActor, name: string, body: Buffer = png, contentType = 'image/png') =>
  app.inject({
    method: 'POST',
    url: `/api/v1/guilds/${guild.id}/emojis?name=${encodeURIComponent(name)}`,
    headers: { ...actor.headers, 'content-type': contentType },
    payload: body,
  })

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

const emojisOf = async (actor: TestActor) =>
  (await api(actor, 'GET', `/guilds/${guild.id}`)).json().data.guild.emojis as {
    id: string
    name: string
    url: string
  }[]

beforeAll(async () => {
  png = await sharp({ create: { width: 300, height: 200, channels: 4, background: '#f80c' } })
    .png()
    .toBuffer()
  gif = await animatedGif()
})

beforeEach(async () => {
  await resetState(db, redis)
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
  await addMember(db, guild.id, member.id)
  events.clear()
})

afterAll(async () => {
  await close()
})

describe('server emoji', () => {
  it('are uploaded by those who manage the server and served publicly', async () => {
    const created = await upload(owner, 'party_cat')
    expect(created.statusCode).toBe(201)
    const emoji = created.json().data.emoji
    expect(emoji).toMatchObject({
      name: 'party_cat',
      url: `/api/v1/emojis/${emoji.id}.webp`,
      animated: false,
    })
    expect(await emojisOf(member)).toEqual([emoji])
    expect(events.published).toContainEqual(
      expect.objectContaining({
        type: 'GUILD_EMOJIS_UPDATE',
        data: { guildId: guild.id, emojis: [emoji] },
      }),
    )

    const image = await app.inject({ method: 'GET', url: emoji.url })
    expect(image.statusCode).toBe(302)
    const fetched = await fetch(image.headers.location as string)
    const meta = await sharp(new Uint8Array(await fetched.arrayBuffer())).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 128, height: 128 })
  })

  it('keep their animation, as animated WebP', async () => {
    const created = await upload(owner, 'dance', gif, 'image/gif')
    expect(created.statusCode).toBe(201)
    const emoji = created.json().data.emoji
    expect(emoji.animated).toBe(true)

    const image = await app.inject({ method: 'GET', url: emoji.url })
    const fetched = await fetch(image.headers.location as string)
    const meta = await sharp(new Uint8Array(await fetched.arrayBuffer()), {
      pages: -1,
    }).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: 128, pageHeight: 128, pages: 3 })
  })

  it('refuse members without the right, taken names and non-images', async () => {
    expect((await upload(member, 'nope')).statusCode).toBe(403)
    await upload(owner, 'cat')
    const taken = await upload(owner, 'CAT')
    expect(taken.statusCode).toBe(409)
    expect(taken.json().code).toBe('EMOJI_NAME_TAKEN')
    const notImage = await upload(owner, 'text', Buffer.from('hello'), 'image/png')
    expect(notImage.json().code).toBe('INVALID_IMAGE')
    expect((await upload(owner, 'кот')).statusCode).toBe(400)
  })

  it('are renamed and deleted, and a deleted one is gone', async () => {
    const emoji = (await upload(owner, 'cat')).json().data.emoji
    const renamed = await api(owner, 'PATCH', `/guilds/${guild.id}/emojis/${emoji.id}`, {
      name: 'kitty',
    })
    expect(renamed.json().data.emoji.name).toBe('kitty')

    expect((await api(owner, 'DELETE', `/guilds/${guild.id}/emojis/${emoji.id}`)).statusCode).toBe(
      204,
    )
    expect(await emojisOf(owner)).toEqual([])
    expect((await app.inject({ method: 'GET', url: emoji.url })).statusCode).toBe(404)
  })
})

describe('reacting with server emoji', () => {
  it("works with the server's own emoji only", async () => {
    const emoji = (await upload(owner, 'cat')).json().data.emoji
    const message = (
      await api(member, 'POST', `/channels/${textId}/messages`, { content: 'привет' })
    ).json().data.message.id
    const react = (text: string) =>
      api(
        member,
        'PUT',
        `/channels/${textId}/messages/${message}/reactions/${encodeURIComponent(text)}/@me`,
      )

    expect((await react(`<:cat:${emoji.id}>`)).statusCode).toBe(204)
    // Another name for the same picture is the same reaction, under its real name.
    expect((await react(`<:admin_approved:${emoji.id}>`)).statusCode).toBe(204)
    const [listed] = (await api(member, 'GET', `/channels/${textId}/messages`)).json().data.messages
    expect(listed.reactions).toEqual([{ emoji: `<:cat:${emoji.id}>`, count: 1, me: true }])

    const other = await createGuild(app, owner, 'Другой')
    const foreignId = (
      await app.inject({
        method: 'POST',
        url: `/api/v1/guilds/${other.id}/emojis?name=dog`,
        headers: { ...owner.headers, 'content-type': 'image/png' },
        payload: png,
      })
    ).json().data.emoji.id
    const dance = (await upload(owner, 'dance', gif, 'image/gif')).json().data.emoji
    expect((await react(`<:dance:${dance.id}>`)).statusCode).toBe(204)
    const [again] = (await api(member, 'GET', `/channels/${textId}/messages`)).json().data.messages
    expect(again.reactions).toContainEqual({ emoji: `<a:dance:${dance.id}>`, count: 1, me: true })

    const foreign = await react(`<:dog:${foreignId}>`)
    expect(foreign.statusCode).toBe(400)
    expect(foreign.json().code).toBe('UNKNOWN_EMOJI')
  })
})
