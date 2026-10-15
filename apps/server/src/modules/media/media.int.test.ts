import { PROFILE_IMAGE_MAX_BYTES } from '@chinchi/shared'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { testStorageConfig } from '../../../test/storage'
import { createTestApp, resetState } from '../../../test/test-app'
import { createObjectStorage } from '../../storage/object-storage'
import { PROFILE_IMAGE_SIDE } from '../../storage/thumbnail'

import type { TestActor } from '../../../test/guild-helpers'

const { app, db, redis, events, close } = createTestApp()
const storage = createObjectStorage(testStorageConfig())

/** `/api/v1/avatars/1/2.webp` → `avatars/1/2.webp` */
const keyOf = (url: string) => url.replace('/api/v1/', '')

let owner: TestActor
let member: TestActor
let outsider: TestActor
let guild: Awaited<ReturnType<typeof createGuild>>
let png: Buffer

const putImage = (actor: TestActor, url: string, body: Buffer, contentType = 'image/png') =>
  app.inject({
    method: 'PUT',
    url: `/api/v1${url}`,
    headers: { ...actor.headers, 'content-type': contentType },
    payload: body,
  })

const remove = (actor: TestActor, url: string) =>
  app.inject({ method: 'DELETE', url: `/api/v1${url}`, headers: actor.headers })

/** Follows the public redirect and returns the image. */
const fetchImage = async (url: string) => {
  const redirect = await app.inject({ method: 'GET', url })
  if (redirect.statusCode !== 302) return { status: redirect.statusCode, redirect }
  const file = await fetch(redirect.headers.location as string)
  return { status: file.status, redirect, file }
}

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  member = await signUp(app, { username: 'member', email: 'member@example.com' })
  outsider = await signUp(app, { username: 'outsider', email: 'outsider@example.com' })
  guild = await createGuild(app, owner)
  await addMember(db, guild.id, member.id)
  png = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#f80' } })
    .png()
    .toBuffer()
})

afterAll(async () => {
  await close()
})

describe('avatars', () => {
  it('sets an avatar served publicly as a square WebP', async () => {
    const response = await putImage(member, '/users/@me/avatar', png)

    expect(response.statusCode).toBe(200)
    const { avatarUrl } = response.json().data.user
    expect(avatarUrl).toMatch(new RegExp(`^/api/v1/avatars/${member.id}/\\d+\\.webp$`))

    const { status, redirect, file } = await fetchImage(avatarUrl)
    expect(status).toBe(200)
    expect(redirect.headers['cache-control']).toMatch(/^public, max-age=\d+$/)
    expect(file?.headers.get('content-type')).toBe('image/webp')
    const meta = await sharp(new Uint8Array(await (file as Response).arrayBuffer())).metadata()
    expect(meta).toMatchObject({ width: PROFILE_IMAGE_SIDE, height: PROFILE_IMAGE_SIDE })
  })

  it('shows the avatar wherever the user appears', async () => {
    const { avatarUrl } = (await putImage(member, '/users/@me/avatar', png)).json().data.user
    expect(events.published).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: `guild:${guild.id}`,
          type: 'USER_UPDATE',
          data: expect.objectContaining({ id: member.id, avatarUrl }),
        }),
      ]),
    )
    const textId = guild.channels.find((c) => c.type === 'text')?.id as string
    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/messages`,
      headers: member.headers,
      payload: { content: 'hi' },
    })
    expect(sent.json().data.message.author.avatarUrl).toBe(avatarUrl)

    const members = await app.inject({
      method: 'GET',
      url: `/api/v1/guilds/${guild.id}/members`,
      headers: owner.headers,
    })
    const listed = members
      .json()
      .data.members.find((m: { user: { id: string } }) => m.user.id === member.id)
    expect(listed.user.avatarUrl).toBe(avatarUrl)
  })

  it('replaces and removes avatars, retiring old URLs', async () => {
    const first = (await putImage(member, '/users/@me/avatar', png)).json().data.user.avatarUrl
    const second = (await putImage(member, '/users/@me/avatar', png)).json().data.user.avatarUrl
    expect(second).not.toBe(first)
    expect((await fetchImage(first)).status).toBe(404)
    expect((await fetchImage(second)).status).toBe(200)

    const cleared = await remove(member, '/users/@me/avatar')
    expect(cleared.json().data.user.avatarUrl).toBeNull()
    expect((await fetchImage(second)).status).toBe(404)
  })

  it('keeps exactly the current image when uploads race', async () => {
    const results = await Promise.all([
      putImage(member, '/users/@me/avatar', png),
      putImage(member, '/users/@me/avatar', png),
      putImage(member, '/users/@me/avatar', png),
    ])
    const urls = results.map((response) => response.json().data.user.avatarUrl as string)
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: member.headers,
    })
    const current = me.json().data.user.avatarUrl as string

    for (const url of urls) {
      const stored = await storage.stat(keyOf(url))
      if (url === current) expect(stored).not.toBeNull()
      else expect(stored).toBeNull()
    }
  })

  it.each([
    ['bytes that are not an image', Buffer.from('not an image'), 'image/png', 400, 'INVALID_IMAGE'],
    [
      'a format that is not allowed',
      Buffer.from('<svg/>'),
      'image/svg+xml',
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    [
      'a file over the limit',
      Buffer.alloc(PROFILE_IMAGE_MAX_BYTES + 1),
      'image/png',
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('rejects %s', async (_case, body, type, status, code) => {
    const response = await putImage(member, '/users/@me/avatar', body, type)
    expect(response.statusCode).toBe(status)
    expect(response.json().code).toBe(code)
  })

  it('requires signing in', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/users/@me/avatar',
      headers: { 'content-type': 'image/png' },
      payload: png,
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('server icons', () => {
  it('lets managers set an icon, announced to the server and shown in invites', async () => {
    const response = await putImage(owner, `/guilds/${guild.id}/icon`, png)

    expect(response.statusCode).toBe(200)
    const { iconUrl } = response.json().data.guild
    expect(iconUrl).toMatch(new RegExp(`^/api/v1/icons/${guild.id}/\\d+\\.webp$`))
    expect(events.published.at(-1)).toMatchObject({ type: 'GUILD_UPDATE', data: { iconUrl } })
    expect((await fetchImage(iconUrl)).status).toBe(200)

    const textId = guild.channels.find((c) => c.type === 'text')?.id as string
    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/invites`,
      headers: owner.headers,
      payload: {},
    })
    const preview = await app.inject({
      method: 'GET',
      url: `/api/v1/invites/${invite.json().data.invite.code}`,
    })
    expect(preview.json().data.invite.guild.iconUrl).toBe(iconUrl)
  })

  it('removes the icon', async () => {
    const { iconUrl } = (await putImage(owner, `/guilds/${guild.id}/icon`, png)).json().data.guild
    const response = await remove(owner, `/guilds/${guild.id}/icon`)
    expect(response.json().data.guild.iconUrl).toBeNull()
    expect((await fetchImage(iconUrl)).status).toBe(404)
  })

  it('deletes the icon together with the server', async () => {
    const { iconUrl } = (await putImage(owner, `/guilds/${guild.id}/icon`, png)).json().data.guild
    expect(await storage.stat(keyOf(iconUrl))).not.toBeNull()

    await remove(owner, `/guilds/${guild.id}`)

    expect(await storage.stat(keyOf(iconUrl))).toBeNull()
  })

  it('requires MANAGE_GUILD and hides the server from outsiders', async () => {
    const denied = await putImage(member, `/guilds/${guild.id}/icon`, png)
    expect(denied.statusCode).toBe(403)
    expect((await putImage(outsider, `/guilds/${guild.id}/icon`, png)).statusCode).toBe(404)
  })
})

describe('profile banners and colours', () => {
  const profileOf = async (viewer: TestActor, userId: string) =>
    (
      await app.inject({
        method: 'GET',
        url: `/api/v1/users/${userId}/profile`,
        headers: viewer.headers,
      })
    ).json().data.profile as { bannerUrl: string | null; accentColor: number | null }

  it('stores a wide banner and shows it on the profile, until removed', async () => {
    const put = await putImage(member, '/users/@me/banner', png)
    expect(put.statusCode).toBe(200)
    const { bannerUrl } = await profileOf(owner, member.id)
    expect(bannerUrl).toMatch(new RegExp(`^/api/v1/banners/${member.id}/\\d+\\.webp$`))

    const fetched = await fetchImage(bannerUrl as string)
    expect(fetched.status).toBe(200)
    const meta = await sharp(Buffer.from(await (fetched.file as Response).arrayBuffer())).metadata()
    expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(3, 1)

    expect((await remove(member, '/users/@me/banner')).statusCode).toBe(200)
    expect((await profileOf(owner, member.id)).bannerUrl).toBeNull()
    expect((await fetchImage(bannerUrl as string)).status).toBe(404)
  })

  it('keeps an accent colour', async () => {
    const set = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/@me',
      headers: member.headers,
      payload: { accentColor: 0x5865f2 },
    })
    expect(set.json().data.user.accentColor).toBe(0x5865f2)
    expect((await profileOf(owner, member.id)).accentColor).toBe(0x5865f2)

    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/v1/users/@me',
      headers: member.headers,
      payload: { accentColor: 0x1000000 },
    })
    expect(bad.statusCode).toBe(400)
  })
})

describe('without object storage', () => {
  const bare = createTestApp({ storage: false })

  afterAll(async () => {
    await bare.close()
  })

  it('reports uploads as disabled', async () => {
    const actor = await signUp(bare.app, { username: 'solo', email: 'solo@example.com' })
    const response = await bare.app.inject({
      method: 'PUT',
      url: '/api/v1/users/@me/avatar',
      headers: { ...actor.headers, 'content-type': 'image/png' },
      payload: png,
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('UPLOADS_DISABLED')
  })
})
