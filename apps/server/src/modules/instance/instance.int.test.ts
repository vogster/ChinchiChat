import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { WEB_ORIGIN, registerUser } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

const open = createTestApp({ env: { INSTANCE_NAME: 'My Chat' } })
const closed = createTestApp({ env: { REGISTRATION_MODE: 'closed' } })

beforeEach(async () => {
  await resetState(open.db, open.redis)
})

afterAll(async () => {
  await Promise.all([open.close(), closed.close()])
})

describe('GET /api/v1/instance', () => {
  it('describes the instance without authentication', async () => {
    const response = await open.app.inject({ method: 'GET', url: '/api/v1/instance' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      success: true,
      data: {
        instance: {
          name: 'My Chat',
          registrationMode: 'open',
          uploads: { maxBytes: 25 * 1024 * 1024, maxAttachments: 10 },
          voice: false,
          requireVerifiedEmail: false,
        },
      },
    })
  })

  it('reports closed registration', async () => {
    const response = await closed.app.inject({ method: 'GET', url: '/api/v1/instance' })
    expect(response.json().data.instance.registrationMode).toBe('closed')
  })
})

describe('registration mode', () => {
  it('rejects sign-ups when registration is closed', async () => {
    const { response } = await registerUser(closed.app)

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ code: 'REGISTRATION_CLOSED' })
  })

  it('still lets existing users sign in when registration is closed', async () => {
    await registerUser(open.app)

    const response = await closed.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: WEB_ORIGIN },
      payload: { login: 'alice', password: 'password123' },
    })

    expect(response.statusCode).toBe(200)
  })
})
