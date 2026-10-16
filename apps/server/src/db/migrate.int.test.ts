import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
    await expect(runMigrations(inject('databaseUrl'), MIGRATIONS_FOLDER)).resolves.toBeUndefined()
  })

  it('lets several server processes start at once: one applies the migrations, the rest wait', async () => {
    const url = new URL(inject('databaseUrl'))
    url.pathname = '/migrate_race'
    await db.execute(sql`drop database if exists migrate_race`)
    await db.execute(sql`create database migrate_race`)
    const fresh = createDatabase(url.toString(), { max: 1 })
    try {
      await Promise.all(
        Array.from({ length: 3 }, () => runMigrations(url.toString(), MIGRATIONS_FOLDER)),
      )

      const journal = JSON.parse(
        readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'),
      ) as { entries: unknown[] }
      const applied = await fresh.db.execute<{ count: number }>(
        sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
      )
      expect(applied[0]?.count).toBe(journal.entries.length)
    } finally {
      await fresh.close()
      await db.execute(sql`drop database migrate_race`)
    }
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
