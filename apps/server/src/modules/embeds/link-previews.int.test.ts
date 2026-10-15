import { createServer } from 'node:http'

import { Permission } from '@chinchi/shared'

import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addMember, createGuild, signUp } from '../../../test/guild-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

import type { TestActor } from '../../../test/guild-helpers'
import type { LinkPreviews } from './link-previews'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const { app, db, redis, events, close } = createTestApp({
  env: { LINK_PREVIEWS: 'on' },
  linkPreviewsReachLocalhost: true,
})

let site: Server
let base: string
let hits: Record<string, number>
let owner: TestActor
let textId: string
let guild: Awaited<ReturnType<typeof createGuild>>

const previews = () => app.linkPreviews as LinkPreviews

const send = async (content: string) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
    payload: { content },
  })
  return response.json().data.message as { id: string; embeds: unknown[] }
}

const latest = async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/channels/${textId}/messages`,
    headers: owner.headers,
  })
  return response.json().data.messages.at(-1) as {
    id: string
    embeds: { url: string; title: string; image: { url: string } | null }[]
  }
}

beforeAll(async () => {
  const png = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#09f' } })
    .png()
    .toBuffer()
  site = createServer((req, res) => {
    hits[req.url ?? ''] = (hits[req.url ?? ''] ?? 0) + 1
    const path = new URL(req.url ?? '/', 'http://site').pathname
    if (path === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<html><head>
        <meta property="og:title" content="Big news">
        <meta property="og:description" content="Something happened">
        <meta property="og:site_name" content="Example">
        <meta property="og:image" content="/cover.png">
      </head></html>`)
    } else if (path === '/cover.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(png)
    } else if (path === '/plain') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>Just a title</title></head></html>')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  base = `http://localhost:${(site.address() as AddressInfo).port}`
})

beforeEach(async () => {
  await resetState(db, redis)
  events.clear()
  hits = {}
  owner = await signUp(app, { username: 'owner', email: 'owner@example.com' })
  guild = await createGuild(app, owner)
  textId = guild.channels.find((c) => c.type === 'text')?.id as string
})

afterAll(async () => {
  await close()
  await new Promise((resolve) => site.close(resolve))
})

describe('link previews', () => {
  it('previews links in the background, with the image stored on the instance', async () => {
    const sent = await send(`look: ${base}/article`)
    expect(sent.embeds).toEqual([])

    await previews().idle()

    const [embed] = (await latest()).embeds
    expect(embed).toMatchObject({
      url: `${base}/article`,
      title: 'Big news',
      description: 'Something happened',
      siteName: 'Example',
      // A random id: the image URL must not reveal which page was linked.
      image: { url: expect.stringMatching(/^\/api\/v1\/embeds\/[0-9a-f]{32}\.webp$/), width: 400 },
    })
    expect(events.published.at(-1)).toMatchObject({
      type: 'MESSAGE_UPDATE',
      data: { id: sent.id, embeds: [embed] },
    })

    const image = await app.inject({ method: 'GET', url: embed?.image?.url as string })
    expect(image.statusCode).toBe(302)
    const file = await fetch(image.headers.location as string)
    expect(file.headers.get('content-type')).toBe('image/webp')
  })

  it('leaves links unpreviewed where the author lacks EMBED_LINKS', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/v1/channels/${textId}/permissions/${guild.id}`,
      headers: owner.headers,
      payload: { targetType: 'role', allow: '0', deny: Permission.EmbedLinks.toString() },
    })
    const member = await signUp(app, { username: 'member', email: 'member@example.com' })
    await addMember(db, guild.id, member.id)
    await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${textId}/messages`,
      headers: member.headers,
      payload: { content: `${base}/article` },
    })
    await previews().idle()

    expect((await latest()).embeds).toEqual([])
    expect(hits['/article']).toBeUndefined()
  })

  it('caches pages, so the same link is fetched once, even when sent twice at once', async () => {
    await Promise.all([send(`${base}/plain`), send(`again ${base}/plain`)])
    await previews().idle()

    expect(hits['/plain']).toBe(1)
    expect((await latest()).embeds).toMatchObject([{ title: 'Just a title', image: null }])
  })

  it('skips <links>, and previews at most three links', async () => {
    await send(`<${base}/article>`)
    await previews().idle()
    expect((await latest()).embeds).toEqual([])

    await send(`${base}/plain?1 ${base}/plain?2 ${base}/plain?3 ${base}/plain?4 ${base}/missing`)
    await previews().idle()
    expect((await latest()).embeds).toHaveLength(3)
  })

  it('redoes previews when an edit changes the links', async () => {
    const sent = await send(`${base}/article`)
    await previews().idle()

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/channels/${textId}/messages/${sent.id}`,
      headers: owner.headers,
      payload: { content: 'never mind' },
    })
    await previews().idle()

    expect((await latest()).embeds).toEqual([])
  })
})
