import { sql } from 'drizzle-orm'

import type { Database } from './client'

export const pingDatabase = async (db: Database): Promise<boolean> => {
  try {
    await db.execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}
