import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest'

import { sql } from 'drizzle-orm'
import { MIGRATIONS_FOLDER } from '../../test/database'
import { createDatabase } from './client'
import { runMigrations } from './migrate'
import { users } from './schema'

const { db, close } = createDatabase(inject('databaseUrl'))

const newUser = (overrides: Partial<typeof users.$inferInsert> = {}) => ({
  id: '1234567890123456789',
  username: 'alice',
  email: 'alice@example.com',
  passwordHash: 'argon2id$hash',
  ...overrides,
})

describe('database schema', () => {
  beforeEach(async () => {
    await db.execute(
      sql`truncate table users, sessions, email_tokens, guilds, channels, guild_members, invites restart identity cascade`,
    )
  })

  afterAll(async () => {
    await close()
  })

  it('is idempotent when migrations run again', async () => {
    await expect(runMigrations(db, MIGRATIONS_FOLDER)).resolves.toBeUndefined()
  })

  it('stores snowflake ids as bigint and returns them as strings', async () => {
    const [created] = await db.insert(users).values(newUser()).returning()

    expect(created).toMatchObject({ id: '1234567890123456789', username: 'alice' })
    expect(created?.createdAt).toBeInstanceOf(Date)
  })

  it('treats usernames as case-insensitively unique', async () => {
    await db.insert(users).values(newUser())

    await expect(
      db.insert(users).values(newUser({ id: '2', username: 'ALICE', email: 'other@example.com' })),
    ).rejects.toThrow()
  })

  it('treats emails as case-insensitively unique', async () => {
    await db.insert(users).values(newUser())

    await expect(
      db.insert(users).values(newUser({ id: '2', username: 'bob', email: 'Alice@Example.com' })),
    ).rejects.toThrow()
  })
})
