import { expect, test } from '@playwright/test'

import { apiUrl } from '../support/bot'
import { newUser } from '../support/users'

import type { APIRequestContext } from '@playwright/test'

/**
 * The parts of docs/security-checklist.md a production build answers for on its own: response
 * headers, session cookie flags, CSRF, and 404s for ids of servers one is not a member of.
 */

const WEB_ORIGIN = 'http://localhost:4173'
const COOKIE = 'chinchi_session'

/** Registers through the API as the web app would (cookie session, same-origin request). */
const register = async (request: APIRequestContext) => {
  const user = newUser()
  const response = await request.post(apiUrl('/auth/register'), {
    data: user,
    headers: { origin: WEB_ORIGIN },
  })
  expect(response.status()).toBe(201)
  const setCookie = response.headers()['set-cookie'] ?? ''
  const token = /chinchi_session=([^;]+)/.exec(setCookie)?.[1]
  expect(token).toBeTruthy()
  return {
    user,
    id: (await response.json()).data.user.id as string,
    cookie: `${COOKIE}=${token}`,
    setCookie,
  }
}

test('the app is served with a strict Content-Security-Policy', async ({ request }) => {
  const response = await request.get('/login')

  const csp = response.headers()['content-security-policy'] ?? ''
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("style-src 'self'")
  expect(csp).not.toContain('unsafe-inline')
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("object-src 'none'")
})

test('the session cookie is HttpOnly, Secure and SameSite=Lax', async ({ request }) => {
  const { setCookie } = await register(request)

  expect(setCookie).toMatch(/HttpOnly/i)
  expect(setCookie).toMatch(/Secure/i)
  expect(setCookie).toMatch(/SameSite=Lax/i)
  expect(setCookie).toMatch(/Path=\//)
})

test('a request with the cookie and a foreign Origin is refused as CSRF', async ({ request }) => {
  const { cookie } = await register(request)

  const foreign = await request.post(apiUrl('/guilds'), {
    data: { name: 'Чужой сайт' },
    headers: { origin: 'https://evil.example', cookie },
  })
  expect(foreign.status()).toBe(403)
  expect((await foreign.json()).code).toBe('CSRF_ORIGIN_MISMATCH')

  const noOrigin = await request.post(apiUrl('/guilds'), {
    data: { name: 'Без Origin' },
    headers: { cookie },
  })
  expect(noOrigin.status()).toBe(403)

  // The API never opens itself to every origin for credentialed requests.
  expect(foreign.headers()['access-control-allow-origin']).not.toBe('*')

  // The same request from the app's own origin goes through.
  const own = await request.post(apiUrl('/guilds'), {
    data: { name: 'Свой сайт' },
    headers: { origin: WEB_ORIGIN, cookie },
  })
  expect(own.status()).toBe(201)
})

test('a non-member sees 404 for every id of a server, not 403', async ({ request }) => {
  const owner = await register(request)
  const stranger = await register(request)
  const created = await request.post(apiUrl('/guilds'), {
    data: { name: 'Закрытый клуб' },
    headers: { origin: WEB_ORIGIN, cookie: owner.cookie },
  })
  const guild = (await created.json()).data.guild
  const channelId = guild.channels.find((c: { type: string }) => c.type === 'text').id as string
  const roleId = guild.roles[0].id as string

  const probes = [
    ['GET', `/guilds/${guild.id}`, 'UNKNOWN_GUILD'],
    ['GET', `/guilds/${guild.id}/members`, 'UNKNOWN_GUILD'],
    ['GET', `/guilds/${guild.id}/roles`, 'UNKNOWN_GUILD'],
    ['GET', `/guilds/${guild.id}/invites`, 'UNKNOWN_GUILD'],
    ['GET', `/channels/${channelId}`, 'UNKNOWN_CHANNEL'],
    ['GET', `/channels/${channelId}/messages`, 'UNKNOWN_CHANNEL'],
    ['GET', `/channels/${channelId}/pins`, 'UNKNOWN_CHANNEL'],
    ['GET', `/channels/${channelId}/webhooks`, 'UNKNOWN_CHANNEL'],
    ['PATCH', `/guilds/${guild.id}/roles/${roleId}`, 'UNKNOWN_GUILD'],
    ['DELETE', `/channels/${channelId}`, 'UNKNOWN_CHANNEL'],
  ] as const

  for (const [method, path, code] of probes) {
    const response = await request.fetch(apiUrl(path), {
      method,
      headers: { origin: WEB_ORIGIN, cookie: stranger.cookie },
      ...(method === 'PATCH' ? { data: { name: 'x' } } : {}),
    })
    expect(response.status(), `${method} ${path}`).toBe(404)
    expect((await response.json()).code, `${method} ${path}`).toBe(code)
  }
})

test('API errors carry no stack traces or internals', async ({ request }) => {
  const response = await request.get(apiUrl('/guilds/not-a-snowflake'), {
    headers: { origin: WEB_ORIGIN },
  })

  const body = await response.json()
  expect(response.status()).toBeGreaterThanOrEqual(400)
  expect(body.success).toBe(false)
  expect(JSON.stringify(body)).not.toMatch(/at .*\.(ts|js|mjs):\d+/)
  expect(JSON.stringify(body)).not.toMatch(/node_modules|postgres|drizzle/i)
})
