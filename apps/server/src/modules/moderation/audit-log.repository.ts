import { and, desc, eq, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { auditLog, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { AuditLogAction, Snowflake } from '@chinchi/shared'

export type AuditLogRow = typeof auditLog.$inferSelect

export interface NewAuditLogEntry {
  readonly id: Snowflake
  readonly guildId: Snowflake
  readonly action: AuditLogAction
  /** Null when the server acted on its own (automod). */
  readonly actorId: Snowflake | null
  readonly targetUserId?: Snowflake | null
  readonly targetId?: Snowflake | null
  readonly reason?: string | null
  readonly data?: Record<string, unknown>
}

const actors = alias(users, 'actors')
const targets = alias(users, 'targets')

export const createAuditLogRepository = (db: DbExecutor) => ({
  async insert(entry: NewAuditLogEntry): Promise<void> {
    await db.insert(auditLog).values({
      id: entry.id,
      guildId: entry.guildId,
      action: entry.action,
      actorId: entry.actorId,
      targetUserId: entry.targetUserId ?? null,
      targetId: entry.targetId ?? null,
      reason: entry.reason ?? null,
      data: entry.data ?? {},
    })
  },

  /** Newest first, older than `before` when given. */
  async page(
    guildId: Snowflake,
    { before, limit }: { before?: Snowflake | undefined; limit: number },
  ): Promise<{ entry: AuditLogRow; actor: UserRow | null; target: UserRow | null }[]> {
    return db
      .select({ entry: auditLog, actor: actors, target: targets })
      .from(auditLog)
      .leftJoin(actors, eq(actors.id, auditLog.actorId))
      .leftJoin(targets, eq(targets.id, auditLog.targetUserId))
      .where(and(eq(auditLog.guildId, guildId), before ? lt(auditLog.id, before) : undefined))
      .orderBy(desc(auditLog.id))
      .limit(limit)
  },
})

export type AuditLogRepository = ReturnType<typeof createAuditLogRepository>
