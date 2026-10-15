import { and, asc, count, eq, inArray, sql } from 'drizzle-orm'

import { messageReactions, messages, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Reaction, Snowflake } from '@chinchi/shared'

export interface ReactionKey {
  readonly messageId: Snowflake
  readonly userId: Snowflake
  readonly emoji: string
}

export type AddResult = 'added' | 'exists' | 'forbidden' | 'full'

export interface AddRules {
  /** May start an emoji that is not on the message yet. */
  readonly canAddNew: boolean
  readonly maxDistinct: number
}

export const createReactionRepository = (db: DbExecutor) => ({
  /**
   * Adds a reaction under the message's row lock, so the distinct-emoji limit and the rule for
   * new emoji hold under concurrent requests.
   */
  async addChecked(key: ReactionKey, { canAddNew, maxDistinct }: AddRules): Promise<AddResult> {
    return db.transaction(async (tx) => {
      await tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.id, key.messageId))
        .for('update')
      const present = await tx
        .selectDistinct({ emoji: messageReactions.emoji })
        .from(messageReactions)
        .where(eq(messageReactions.messageId, key.messageId))
      if (!present.some((row) => row.emoji === key.emoji)) {
        if (!canAddNew) return 'forbidden'
        if (present.length >= maxDistinct) return 'full'
      }
      const rows = await tx
        .insert(messageReactions)
        .values(key)
        .onConflictDoNothing()
        .returning({ emoji: messageReactions.emoji })
      return rows.length > 0 ? 'added' : 'exists'
    })
  },

  /** False when there was nothing to remove. */
  async remove({ messageId, userId, emoji }: ReactionKey): Promise<boolean> {
    const rows = await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.emoji, emoji),
        ),
      )
      .returning({ emoji: messageReactions.emoji })
    return rows.length > 0
  },

  /** Each message's reactions in order of first use, `me` for the given viewer. */
  async summaries(
    messageIds: readonly Snowflake[],
    viewerId: Snowflake | null,
  ): Promise<Map<Snowflake, Reaction[]>> {
    if (messageIds.length === 0) return new Map()
    const rows = await db
      .select({
        messageId: messageReactions.messageId,
        emoji: messageReactions.emoji,
        count: count(),
        me: viewerId
          ? sql<boolean>`bool_or(${messageReactions.userId} = ${viewerId})`
          : sql<boolean>`false`,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, [...messageIds]))
      .groupBy(messageReactions.messageId, messageReactions.emoji)
      .orderBy(sql`min(${messageReactions.createdAt})`, asc(messageReactions.emoji))
    const byMessage = new Map<Snowflake, Reaction[]>()
    for (const { messageId, ...reaction } of rows) {
      byMessage.set(messageId, [...(byMessage.get(messageId) ?? []), reaction])
    }
    return byMessage
  },

  /** Who reacted with an emoji, earliest first. */
  async listUsers(messageId: Snowflake, emoji: string, limit: number): Promise<UserRow[]> {
    const rows = await db
      .select({ user: users })
      .from(messageReactions)
      .innerJoin(users, eq(users.id, messageReactions.userId))
      .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.emoji, emoji)))
      .orderBy(asc(messageReactions.createdAt), asc(users.id))
      .limit(limit)
    return rows.map((row) => row.user)
  },
})

export type ReactionRepository = ReturnType<typeof createReactionRepository>
