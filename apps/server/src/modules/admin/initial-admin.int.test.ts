import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { registerUser } from '../../../test/auth-helpers'
import { createTestApp, resetState } from '../../../test/test-app'

// Registration is closed from the start: only the designated admin may sign up.
const { app, db, redis, close } = createTestApp({
  env: { RATE_LIMIT: 'off', REGISTRATION_MODE: 'closed', INITIAL_ADMIN_EMAIL: 'Boss@Example.com' },
})

beforeEach(async () => {
  await resetState(db, redis)
})

afterAll(async () => {
  await close()
})

describe('a designated first admin', () => {
  it('may register on a closed instance and runs it; nobody else gets in', async () => {
    const stranger = await registerUser(app, { username: 'eve', email: 'eve@example.com' })
    expect(stranger.response.json().code).toBe('REGISTRATION_CLOSED')

    const boss = await registerUser(app, { username: 'boss', email: 'boss@example.com' })
    expect(boss.response.statusCode).toBe(201)
    expect(boss.response.json().data.user.isAdmin).toBe(true)

    // Others still can't register.
    const again = await registerUser(app, { username: 'boss2', email: 'eve2@example.com' })
    expect(again.response.json().code).toBe('REGISTRATION_CLOSED')
  })

  it('is no shortcut once the instance has an admin', async () => {
    const boss = await registerUser(app, { username: 'boss', email: 'boss@example.com' })
    expect(boss.response.json().data.user.isAdmin).toBe(true)
    // The designated address is free again (the account was deleted), but admins exist.
    await db.execute(sql`update users set email = 'old-boss@example.com'`)
    await db.execute(sql`update instance_settings set registration_mode = 'open'`)
    await db.execute(
      sql`insert into instance_settings (id, registration_mode) values (1, 'open') on conflict do nothing`,
    )

    const claim = await registerUser(app, { username: 'eve', email: 'boss@example.com' })
    expect(claim.response.statusCode).toBe(201)
    expect(claim.response.json().data.user.isAdmin).toBe(false)
  })
})
