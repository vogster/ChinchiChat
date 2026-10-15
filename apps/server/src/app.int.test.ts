import { afterAll, describe, expect, it } from 'vitest'

import { createTestApp } from '../test/test-app'

describe('app with real dependencies', () => {
  const { app, close } = createTestApp()

  afterAll(async () => {
    await close()
  })

  it('GET /ready reports ready when Postgres and Valkey respond', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)
  })
})
