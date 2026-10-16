import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { createDatabase } from './client'

/**
 * Any fixed key: every Chinchi process takes the same advisory lock, so when several start at
 * once (a scaled compose service, a rolling restart) one applies the migrations and the rest
 * wait, then find nothing left to do. Without it they race on creating the migrations table.
 */
const MIGRATIONS_LOCK = 7_355_608

/**
 * Applies pending SQL migrations from `apps/server/drizzle`. The caller passes the folder because
 * its location relative to this module differs between sources (`src/`) and the bundle (`dist/`).
 */
export const runMigrations = async (
  databaseUrl: string,
  migrationsFolder: string,
): Promise<void> => {
  // A connection of its own, and only one: the advisory lock is session-level, so it lives on
  // that connection, and every query of the migrator goes through the same one. Closing the
  // connection releases the lock.
  const { db, close } = createDatabase(databaseUrl, { max: 1 })
  try {
    await db.execute(sql`select pg_advisory_lock(${sql.raw(String(MIGRATIONS_LOCK))})`)
    await migrate(db, { migrationsFolder })
  } finally {
    await close()
  }
}
