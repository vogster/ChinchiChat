import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

export type Database = PostgresJsDatabase<typeof schema>

/** The database or a transaction: repositories accept either. */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0]

export interface DatabaseOptions {
  readonly max?: number
}

export interface DatabaseHandle {
  readonly db: Database
  readonly close: () => Promise<void>
}

export const createDatabase = (url: string, { max = 10 }: DatabaseOptions = {}): DatabaseHandle => {
  const client = postgres(url, { max, onnotice: () => undefined })
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    close: () => client.end({ timeout: 5 }),
  }
}
