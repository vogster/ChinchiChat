import { describe, expect, it, vi } from 'vitest'

import { testUser } from '../test/fake-api'
import { createDesktopApi, gatewayUrlOf } from './api'

import type { FetchLike } from '@chinchi/sdk'

const user = testUser

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchAnswering = (answer: (url: string, init: RequestInit) => Response) =>
  vi.fn<FetchLike>(async (url, init) => answer(url, init))

describe('the desktop API client', () => {
  it('talks to the chosen instance in bearer mode and keeps the token it is given', async () => {
    const token = { current: null as string | null }
    const fetch = fetchAnswering((url) =>
      url.endsWith('/auth/login')
        ? json(200, { success: true, data: { user, token: 'session-token' } })
        : json(200, { success: true, data: { user } }),
    )
    const api = createDesktopApi({
      instanceUrl: 'https://chat.example.com',
      fetch,
      token: { get: () => token.current, set: async (value) => void (token.current = value) },
    })

    await api.auth.login({ login: 'alice', password: 'password123' })

    expect(token.current).toBe('session-token')
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://chat.example.com/api/v1/auth/login')
    expect(new Headers(init.headers).get('x-auth-mode')).toBe('bearer')

    await api.users.me()
    const [, second] = fetch.mock.calls[1] as [string, RequestInit]
    expect(new Headers(second.headers).get('authorization')).toBe('Bearer session-token')
  })

  it('leaves the token alone while 2FA is pending, and drops it on logout', async () => {
    const token = { current: 'old-token' as string | null }
    const fetch = fetchAnswering((url) =>
      url.endsWith('/auth/login')
        ? json(200, { success: true, data: { mfaTicket: 'ticket' } })
        : url.endsWith('/auth/login/mfa')
          ? json(200, { success: true, data: { user, token: 'fresh-token' } })
          : new Response(null, { status: 204 }),
    )
    const api = createDesktopApi({
      instanceUrl: 'https://chat.example.com',
      fetch,
      token: { get: () => token.current, set: async (value) => void (token.current = value) },
    })

    await api.auth.login({ login: 'alice', password: 'password123' })
    expect(token.current).toBe('old-token')
    await api.auth.loginMfa({ ticket: 'ticket', code: '123456' })
    expect(token.current).toBe('fresh-token')

    await api.auth.logout()
    expect(token.current).toBeNull()
  })

  it('forgets the token even when the server cannot be reached for logout', async () => {
    const token = { current: 'old-token' as string | null }
    const fetch = fetchAnswering(() => {
      throw new TypeError('offline')
    })
    const api = createDesktopApi({
      instanceUrl: 'https://chat.example.com',
      fetch,
      token: { get: () => token.current, set: async (value) => void (token.current = value) },
    })

    await expect(api.auth.logout()).rejects.toThrow()
    expect(token.current).toBeNull()
  })
})

describe('gatewayUrlOf', () => {
  it('derives the gateway address from the instance', () => {
    expect(gatewayUrlOf('https://chat.example.com')).toBe('wss://chat.example.com/api/v1/gateway')
    expect(gatewayUrlOf('http://localhost:3000')).toBe('ws://localhost:3000/api/v1/gateway')
  })
})
