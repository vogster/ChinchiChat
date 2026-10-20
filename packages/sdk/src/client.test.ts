import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiClient } from './client'

const user = {
  id: '123',
  username: 'alice',
  displayName: null,
  avatarUrl: null,
  email: 'alice@example.com',
  emailVerified: false,
  dmPolicy: 'servers',
  locale: 'ru',
  bio: null,
  mfaEnabled: false,
  isAdmin: false,
  createdAt: '2026-10-14T12:00:00.000Z',
  bannerUrl: null,
  accentColor: null,
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const setup = (response: Response | (() => Promise<Response>), options = {}) => {
  const fetch = vi.fn(typeof response === 'function' ? response : async () => response)
  const api = createApiClient({ baseUrl: 'https://chat.example.com/api/v1', fetch, ...options })
  return { api, fetch }
}

const requestOf = (fetch: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

describe('createApiClient', () => {
  it('sends JSON bodies with cookies and returns validated data', async () => {
    const { api, fetch } = setup(jsonResponse(200, { success: true, data: { user } }))

    const result = await api.auth.login({ login: 'alice', password: 'password123' })

    expect(result).toEqual({ user })
    const { url, init, headers } = requestOf(fetch)
    expect(url).toBe('https://chat.example.com/api/v1/auth/login')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ login: 'alice', password: 'password123' })
  })

  it('signs in in two steps when the account has 2FA', async () => {
    const ticket = 't'.repeat(43)
    const first = setup(jsonResponse(200, { success: true, data: { mfaTicket: ticket } }))
    expect(await first.api.auth.login({ login: 'alice', password: 'password123' })).toEqual({
      mfaTicket: ticket,
    })

    const second = setup(jsonResponse(200, { success: true, data: { user } }))
    expect(await second.api.auth.loginMfa({ ticket, code: '123456' })).toEqual({ user })
    const { url, init } = requestOf(second.fetch)
    expect(url).toBe('https://chat.example.com/api/v1/auth/login/mfa')
    expect(JSON.parse(init.body as string)).toEqual({ ticket, code: '123456' })
  })

  it('sets up, enables and turns off 2FA', async () => {
    const setupCall = setup(
      jsonResponse(200, { success: true, data: { secret: 'ABC', uri: 'otpauth://totp/x' } }),
    )
    expect(await setupCall.api.mfa.setup('password123')).toEqual({
      secret: 'ABC',
      uri: 'otpauth://totp/x',
    })
    expect(requestOf(setupCall.fetch).url).toBe(
      'https://chat.example.com/api/v1/users/@me/mfa/totp/setup',
    )

    const codes = { recoveryCodes: ['abcde-fghij'] }
    const enable = setup(jsonResponse(200, { success: true, data: codes }))
    expect(await enable.api.mfa.enable('123456')).toEqual(codes)

    const renew = setup(jsonResponse(200, { success: true, data: codes }))
    expect(await renew.api.mfa.renewRecoveryCodes({ password: 'p', code: '123456' })).toEqual(codes)
    expect(requestOf(renew.fetch).url).toBe(
      'https://chat.example.com/api/v1/users/@me/mfa/recovery-codes',
    )

    const disable = setup(jsonResponse(200, { success: true, data: null }))
    await disable.api.mfa.disable({ password: 'p', code: '123456' })
    expect(requestOf(disable.fetch).url).toBe(
      'https://chat.example.com/api/v1/users/@me/mfa/disable',
    )
  })

  it('lets admins search users and change the instance', async () => {
    const users = setup(jsonResponse(200, { success: true, data: { users: [] } }))
    await users.api.admin.users({ query: 'bob smith', before: '99' })
    expect(requestOf(users.fetch).url).toBe(
      'https://chat.example.com/api/v1/admin/users?query=bob+smith&before=99',
    )

    const settings = {
      registrationMode: 'invite',
      maxGuildsPerUser: 5,
      requireVerifiedEmail: false,
    }
    const update = setup(jsonResponse(200, { success: true, data: { settings } }))
    expect(await update.api.admin.updateSettings({ registrationMode: 'invite' })).toEqual({
      settings,
    })
    expect(requestOf(update.fetch).init.method).toBe('PATCH')

    const revoke = setup(new Response(null, { status: 204 }))
    await revoke.api.admin.revokeInvite('Abc12345')
    expect(requestOf(revoke.fetch).url).toBe(
      'https://chat.example.com/api/v1/admin/invites/Abc12345',
    )
  })

  it('reports a message and lets moderators close reports', async () => {
    const send = setup(new Response(null, { status: 204 }))
    await send.api.reports.create('10', '20', { reason: 'spam' })
    const { url, init } = requestOf(send.fetch)
    expect(url).toBe('https://chat.example.com/api/v1/channels/10/messages/20/report')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'spam' })

    const list = setup(jsonResponse(200, { success: true, data: { reports: [] } }))
    await list.api.reports.guild('5', { status: 'resolved' })
    expect(requestOf(list.fetch).url).toBe(
      'https://chat.example.com/api/v1/guilds/5/reports?status=resolved',
    )
  })

  it('reads and changes the automod of a server', async () => {
    const automod = { blockedWords: ['спам'], antiSpam: true, maxMentions: null }
    const update = setup(jsonResponse(200, { success: true, data: { automod } }))
    expect(await update.api.automod.update('5', { antiSpam: true })).toEqual({ automod })
    expect(requestOf(update.fetch).url).toBe('https://chat.example.com/api/v1/guilds/5/automod')
  })

  it('calls every admin, report and automod endpoint at the right path', async () => {
    const empty = (data: unknown) => jsonResponse(200, { success: true, data })
    const calls: [string, string][] = []
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      calls.push([init.method ?? 'GET', url.replace('https://chat.example.com/api/v1', '')])
      if (url.includes('/automod')) {
        return empty({ automod: { blockedWords: [], antiSpam: false, maxMentions: null } })
      }
      if (url.endsWith('/settings')) {
        return empty({
          settings: {
            registrationMode: 'open',
            maxGuildsPerUser: null,
            requireVerifiedEmail: false,
          },
        })
      }
      if (url.includes('/reports')) return empty({ reports: [] })
      if (url.includes('/admin/users')) return empty({ users: [] })
      if (url.includes('/admin/guilds') && init.method === 'GET') return empty({ guilds: [] })
      if (url.endsWith('/admin/invites') && init.method === 'GET') return empty({ invites: [] })
      return new Response(null, { status: 204 })
    })
    const api = createApiClient({ baseUrl: 'https://chat.example.com/api/v1', fetch })

    await api.automod.get('5')
    await api.admin.settings()
    await api.admin.users()
    await api.admin.users({ limit: 20 })
    await api.admin.guilds({ query: 'кот', before: '9', limit: 10 })
    await api.admin.deleteGuild('5')
    await api.admin.invites()
    await api.reports.guild('5')
    await api.reports.direct({ before: '9', limit: 5 })

    expect(calls).toEqual([
      ['GET', '/guilds/5/automod'],
      ['GET', '/admin/settings'],
      ['GET', '/admin/users'],
      ['GET', '/admin/users?limit=20'],
      ['GET', `/admin/guilds?query=${encodeURIComponent('кот')}&before=9&limit=10`],
      ['DELETE', '/admin/guilds/5'],
      ['GET', '/admin/invites'],
      ['GET', '/guilds/5/reports'],
      ['GET', '/admin/reports?before=9&limit=5'],
    ])
  })

  it('searches a server or a channel', async () => {
    const result = { messages: [], total: 0 }
    const guild = setup(jsonResponse(200, { success: true, data: result }))
    expect(await guild.api.search.guild('5', { q: 'кот', has: 'image', limit: 10 })).toEqual(result)
    expect(requestOf(guild.fetch).url).toBe(
      `https://chat.example.com/api/v1/guilds/5/messages/search?q=${encodeURIComponent('кот')}&has=image&limit=10`,
    )

    const channel = setup(jsonResponse(200, { success: true, data: result }))
    await channel.api.search.channel('7', { authorId: '3', q: '' })
    expect(requestOf(channel.fetch).url).toBe(
      'https://chat.example.com/api/v1/channels/7/messages/search?authorId=3',
    )
  })

  it('starts a thread', async () => {
    const thread = {
      id: '9',
      guildId: '5',
      type: 'thread',
      name: 'Релиз',
      topic: null,
      parentId: '7',
      position: 0,
      lastMessageId: null,
      permissionOverwrites: [],
      rateLimitPerUser: 0,
      nsfw: false,
      announcement: false,
      threadStarterId: '8',
      messageCount: 0,
      ownerId: '1',
    }
    const created = setup(jsonResponse(201, { success: true, data: { channel: thread } }))
    expect(await created.api.channels.createThread('7', { name: 'Релиз', messageId: '8' })).toEqual(
      {
        channel: thread,
      },
    )
    expect(requestOf(created.fetch).url).toBe('https://chat.example.com/api/v1/channels/7/threads')
  })

  it('uploads, renames and deletes server emoji', async () => {
    const emoji = { id: '9', name: 'cat', url: '/api/v1/emojis/9.webp', animated: false }
    const create = setup(jsonResponse(201, { success: true, data: { emoji } }))
    const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    expect(await create.api.emojis.create('5', 'cat', image)).toEqual({ emoji })
    const { url, headers } = requestOf(create.fetch)
    expect(url).toBe('https://chat.example.com/api/v1/guilds/5/emojis?name=cat')
    expect(headers.get('content-type')).toBe('image/png')

    const rename = setup(jsonResponse(200, { success: true, data: { emoji } }))
    await rename.api.emojis.rename('5', '9', 'kitty')
    expect(requestOf(rename.fetch).init.method).toBe('PATCH')

    const remove = setup(new Response(null, { status: 204 }))
    await remove.api.emojis.delete('5', '9')
    expect(requestOf(remove.fetch).url).toBe('https://chat.example.com/api/v1/guilds/5/emojis/9')
  })

  it('manages incoming webhooks', async () => {
    const webhook = {
      id: '9',
      guildId: '5',
      channelId: '7',
      name: 'CI',
      createdBy: null,
      createdAt: '2026-10-15T10:00:00.000Z',
      sourceChannelId: null,
    }
    const create = setup(
      jsonResponse(201, { success: true, data: { webhook, url: '/api/v1/webhooks/9/secret' } }),
    )
    expect(await create.api.webhooks.create('7', 'CI')).toEqual({
      webhook,
      url: '/api/v1/webhooks/9/secret',
    })
    const list = setup(jsonResponse(200, { success: true, data: { webhooks: [webhook] } }))
    await list.api.webhooks.list('7')
    expect(requestOf(list.fetch).url).toBe('https://chat.example.com/api/v1/channels/7/webhooks')
    const remove = setup(new Response(null, { status: 204 }))
    await remove.api.webhooks.delete('9')
    expect(requestOf(remove.fetch).url).toBe('https://chat.example.com/api/v1/webhooks/9')
  })

  it('manages bots and adds them to servers', async () => {
    const bot = {
      user: { id: '9', username: 'helper_bot', displayName: null, avatarUrl: null, bot: true },
      ownerId: '1',
      public: false,
      createdAt: '2026-10-15T10:00:00.000Z',
    }
    const create = setup(jsonResponse(201, { success: true, data: { bot, token: 't' } }))
    expect(await create.api.bots.create('helper_bot')).toEqual({ bot, token: 't' })
    const renew = setup(jsonResponse(200, { success: true, data: { token: 'n' } }))
    expect(await renew.api.bots.renewToken('9')).toEqual({ token: 'n' })
    expect(requestOf(renew.fetch).url).toBe('https://chat.example.com/api/v1/bots/9/token')
    const add = setup(new Response(null, { status: 204 }))
    await add.api.bots.addToGuild('5', '9')
    expect(JSON.parse(requestOf(add.fetch).init.body as string)).toEqual({ botId: '9' })
  })

  it('does not send a content type for bodiless requests', async () => {
    const { api, fetch } = setup(new Response(null, { status: 204 }))

    await api.auth.logout()

    const { init, headers } = requestOf(fetch)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(headers.has('content-type')).toBe(false)
  })

  it('uses bearer auth when a token provider is configured', async () => {
    const { api, fetch } = setup(jsonResponse(200, { success: true, data: { user } }), {
      getToken: () => 'secret-token',
    })

    await api.users.me()

    const { init, headers } = requestOf(fetch)
    expect(headers.get('authorization')).toBe('Bearer secret-token')
    expect(headers.get('x-auth-mode')).toBe('bearer')
    expect(init.credentials).toBe('omit')
  })

  it('throws ApiError with the server code and details', async () => {
    const { api } = setup(
      jsonResponse(409, {
        success: false,
        code: 'USERNAME_TAKEN',
        error: 'Username is already taken',
      }),
    )

    const error = await api.auth
      .register({ username: 'alice', email: 'a@example.com', password: 'password123' })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username is already taken',
    })
  })

  it('keeps validation details', async () => {
    const details = [{ path: 'username', message: 'Too short' }]
    const { api } = setup(
      jsonResponse(400, {
        success: false,
        code: 'VALIDATION_FAILED',
        error: 'Validation failed',
        details,
      }),
    )

    const error = (await api.users
      .updateMe({ displayName: 'x' })
      .catch((e: unknown) => e)) as ApiError
    expect(error.details).toEqual(details)
  })

  it('sends images as raw bodies with their own type', async () => {
    const { api, fetch } = setup(jsonResponse(200, { success: true, data: { user } }))
    const image = new Blob([new Uint8Array([1, 2])], { type: 'image/png' })

    await api.users.setAvatar(image)

    const { url, init, headers } = requestOf(fetch)
    expect(url).toBe('https://chat.example.com/api/v1/users/@me/avatar')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(image)
    expect(headers.get('content-type')).toBe('image/png')
  })

  it('maps network failures to NETWORK_ERROR', async () => {
    const { api } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(api.instance.get()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })

  it('maps non-JSON error responses to an HTTP code', async () => {
    const { api } = setup(new Response('<html>Bad Gateway</html>', { status: 502 }))

    await expect(api.instance.get()).rejects.toMatchObject({ code: 'HTTP_502', status: 502 })
  })

  it('rejects responses that do not match the schema', async () => {
    const { api } = setup(jsonResponse(200, { success: true, data: { user: { id: 1 } } }))

    await expect(api.users.me()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('encodes path parameters', async () => {
    const { api, fetch } = setup(new Response(null, { status: 204 }))

    await api.sessions.revoke('123')

    expect(requestOf(fetch).url).toBe('https://chat.example.com/api/v1/auth/sessions/123')
    expect(requestOf(fetch).init.method).toBe('DELETE')
  })
})

describe('endpoints', () => {
  it.each([
    [
      'auth.verifyEmail',
      (api: ReturnType<typeof createApiClient>) => api.auth.verifyEmail('t'.repeat(43)),
      'POST',
      '/auth/verify-email',
    ],
    [
      'auth.resendVerification',
      (api: ReturnType<typeof createApiClient>) => api.auth.resendVerification(),
      'POST',
      '/auth/verify-email/resend',
    ],
    [
      'auth.forgotPassword',
      (api: ReturnType<typeof createApiClient>) => api.auth.forgotPassword('a@example.com'),
      'POST',
      '/auth/password/forgot',
    ],
    [
      'auth.resetPassword',
      (api: ReturnType<typeof createApiClient>) =>
        api.auth.resetPassword('t'.repeat(43), 'password123'),
      'POST',
      '/auth/password/reset',
    ],
    [
      'auth.changePassword',
      (api: ReturnType<typeof createApiClient>) =>
        api.auth.changePassword({ currentPassword: 'a', newPassword: 'password123' }),
      'POST',
      '/auth/password/change',
    ],
    [
      'auth.changeEmail',
      (api: ReturnType<typeof createApiClient>) =>
        api.auth.changeEmail({ email: 'new@example.com', password: 'p' }),
      'POST',
      '/users/@me/email',
    ],
    [
      'auth.confirmEmailChange',
      (api: ReturnType<typeof createApiClient>) => api.auth.confirmEmailChange('t'.repeat(43)),
      'POST',
      '/auth/email/confirm',
    ],
    [
      'sessions.list',
      (api: ReturnType<typeof createApiClient>) => api.sessions.list(),
      'GET',
      '/auth/sessions',
    ],
    [
      'sessions.revokeOthers',
      (api: ReturnType<typeof createApiClient>) => api.sessions.revokeOthers(),
      'DELETE',
      '/auth/sessions',
    ],
  ])('%s calls %s %s', async (_name, call, method, path) => {
    const bodies: Record<string, unknown> = {
      '/auth/verify-email': { success: true, data: { user } },
      '/auth/email/confirm': { success: true, data: { user } },
      '/auth/sessions': { success: true, data: { sessions: [] } },
    }
    const body = bodies[path] ?? { success: true, data: null }
    const response =
      method === 'DELETE' ? new Response(null, { status: 204 }) : jsonResponse(200, body)
    const { api, fetch } = setup(response)

    await call(api)

    const { url, init } = requestOf(fetch)
    expect(url).toBe(`https://chat.example.com/api/v1${path}`)
    expect(init.method).toBe(method)
  })
})
