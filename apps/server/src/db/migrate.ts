import { migrate } from 'drizzle-orm/postgres-js/migrator'

import type { Database } from './client'

/**
 * Applies pending SQL migrations from `apps/server/drizzle`. The caller passes the folder because
 * its location relative to this module differs between sources (`src/`) and the bundle (`dist/`).
 */
export const runMigrations = async (db: Database, migrationsFolder: string): Promise<void> => {
  await migrate(db, { migrationsFolder })
}
