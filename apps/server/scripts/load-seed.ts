/**
 * Seeds a throwaway database for the k6 load test (`load/`): users with ready sessions,
 * grouped into servers of LOAD_GUILD_SIZE members, one sender per server. Writes the
 * tokens to LOAD_OUT for k6. Never point it at a real database: it starts from scratch.
 *
 *   LOAD_DATABASE_URL=postgres://chinchi:chinchi@localhost:5432/chinchi_load \
 *   LOAD_USERS=10000 LOAD_GUILD_SIZE=100 pnpm --filter @chinchi/server load:seed
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createSnowflakeGenerator } from '@chinchi/shared'
import postgres from 'postgres'

import { buildApp } from '../src/app'
import { loadConfig } from '../src/config/env'
import { createDatabase } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { guildMembers, sessions, users } from '../src/db/schema'
import { generateSessionToken } from '../src/modules/auth/session-token'

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url))
const BATCH = 1000
const DAY_MS = 24 * 60 * 60 * 1000

const env = process.env
const databaseUrl =
  env.LOAD_DATABASE_URL ?? 'postgres://chinchi:chinchi@localhost:5432/chinchi_load'
const userCount = Number(env.LOAD_USERS ?? 10_000)
const guildSize = Number(env.LOAD_GUILD_SIZE ?? 100)
const out =
  env.LOAD_OUT ?? fileURLToPath(new URL('../../../load/.data/users.json', import.meta.url))

if (!/\/chinchi_load$/.test(databaseUrl)) {
  throw new Error('LOAD_DATABASE_URL must name a database called chinchi_load (it is wiped)')
}

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  )

/** Drops and recreates the load database, so every run starts the same. */
const recreateDatabase = async () => {
  const admin = postgres(databaseUrl.replace(/\/chinchi_load$/, '/postgres'), { max: 1 })
  await admin.unsafe('DROP DATABASE IF EXISTS chinchi_load WITH (FORCE)')
  await admin.unsafe('CREATE DATABASE chinchi_load')
  await admin.end()
}

const main = async () => {
  await recreateDatabase()
  const database = createDatabase(databaseUrl)
  await runMigrations(database.db, MIGRATIONS)
  const nextId = createSnowflakeGenerator({ workerId: 1 })
  const now = new Date()

  const people = Array.from({ length: userCount }, (_, i) => ({
    id: nextId(),
    username: `load_${i}`,
    token: generateSessionToken(),
  }))
  for (const batch of chunks(people, BATCH)) {
    await database.db.insert(users).values(
      batch.map((p) => ({
        id: p.id,
        username: p.username,
        email: `${p.username}@load.invalid`,
        // Never signs in with a password: sessions are created right here.
        passwordHash: 'load-test-no-password',
        emailVerifiedAt: now,
      })),
    )
    await database.db.insert(sessions).values(
      batch.map((p) => ({
        id: nextId(),
        userId: p.id,
        tokenHash: p.token.tokenHash,
        expiresAt: new Date(now.getTime() + DAY_MS),
      })),
    )
  }

  // Servers are created through the API, so their channels and roles are the real ones.
  const app = buildApp(
    loadConfig({ LOG_LEVEL: 'warn', ...env, DATABASE_URL: databaseUrl, RATE_LIMIT: 'off' }),
    {
      db: database.db,
    },
  )
  const seeded: { token: string; guildId: string; channelId: string; sender: boolean }[] = []
  for (const [index, group] of chunks(people, guildSize).entries()) {
    const [owner, ...rest] = group
    if (!owner) continue
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/guilds',
      headers: { authorization: `Bearer ${owner.token.token}` },
      payload: { name: `Load ${index}`, locale: 'en' },
    })
    const guild = response.json().data.guild as {
      id: string
      channels: { id: string; type: string }[]
    }
    const channelId = guild.channels.find((c) => c.type === 'text')?.id as string
    for (const batch of chunks(rest, BATCH)) {
      await database.db
        .insert(guildMembers)
        .values(batch.map((p) => ({ guildId: guild.id, userId: p.id })))
    }
    group.forEach((p, i) => {
      seeded.push({ token: p.token.token, guildId: guild.id, channelId, sender: i === 0 })
    })
  }

  await app.close()
  await database.close()
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(seeded))
  process.stdout.write(
    `Seeded ${seeded.length} users in ${Math.ceil(userCount / guildSize)} servers → ${out}\n`,
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`Seeding failed: ${String(error)}\n`)
  process.exit(1)
})
