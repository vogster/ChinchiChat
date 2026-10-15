import { sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'

import type { Snowflake } from '@chinchi/shared'

/**
 * Snowflake IDs live in Postgres as BIGINT and in JS as decimal strings.
 * postgres.js already returns int8 as a string, so no precision is lost on the way back.
 */
export const snowflake = customType<{ data: Snowflake; driverData: string }>({
  dataType: () => 'bigint',
  toDriver: (value) => value,
  fromDriver: (value) => String(value),
})

/** A BIGINT[] of snowflakes; written as an array literal so the driver never guesses the type. */
export const snowflakeArray = customType<{ data: Snowflake[]; driverData: string[] }>({
  dataType: () => 'bigint[]',
  toDriver: (value) => sql`${`{${value.join(',')}}`}::bigint[]`,
  fromDriver: (value) => value.map(String),
})
