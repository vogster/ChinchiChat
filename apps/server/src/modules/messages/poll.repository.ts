import { POLL_VOTER_SAMPLE } from '@chinchi/shared'
import { and, asc, count, countDistinct, eq, gt, inArray, lte, sql } from 'drizzle-orm'

import { pollAnswers, polls, pollVotes, users } from '../../db/schema'
import { toPublicUser } from '../users/user.mapper'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { Poll, PublicUser, Snowflake } from '@chinchi/shared'

export type PollRow = typeof polls.$inferSelect

/** A poll as the message that carries it is being written. */
export interface NewPoll {
  readonly question: string
  readonly answers: readonly string[]
  readonly multiple: boolean
  readonly anonymous: boolean
  readonly expiresAt: Date
}

/** Writes a poll for a message, in the same transaction as the message. */
export const insertPoll = async (tx: DbExecutor, messageId: Snowflake, poll: NewPoll) => {
  await tx.insert(polls).values({
    messageId,
    question: poll.question,
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    expiresAt: poll.expiresAt,
  })
  await tx
    .insert(pollAnswers)
    .values(poll.answers.map((text, index) => ({ messageId, answerId: index + 1, text })))
}

export const createPollRepository = (db: DbExecutor, now: () => Date = () => new Date()) => {
  /** The first few voters of each answer (by id), for polls that show who voted. */
  const samples = async (messageIds: readonly Snowflake[]) => {
    if (messageIds.length === 0) return []
    const ranked = db
      .select({
        messageId: pollVotes.messageId,
        answerId: pollVotes.answerId,
        userId: pollVotes.userId,
        rank: sql<number>`row_number() over (partition by ${pollVotes.messageId}, ${pollVotes.answerId} order by ${pollVotes.userId})`.as(
          'rank',
        ),
      })
      .from(pollVotes)
      .where(inArray(pollVotes.messageId, [...messageIds]))
      .as('ranked')
    return db
      .select({ messageId: ranked.messageId, answerId: ranked.answerId, user: users })
      .from(ranked)
      .innerJoin(users, eq(users.id, ranked.userId))
      .where(lte(ranked.rank, POLL_VOTER_SAMPLE))
      .orderBy(asc(ranked.userId))
  }

  /** Polls of these messages with counts, and `me` for the viewer (none for broadcasts). */
  const summaries = async (
    messageIds: readonly Snowflake[],
    viewerId: Snowflake | null,
  ): Promise<Map<Snowflake, Poll>> => {
    const result = new Map<Snowflake, Poll>()
    if (messageIds.length === 0) return result
    const ids = [...messageIds]
    const rows = await db.select().from(polls).where(inArray(polls.messageId, ids))
    if (rows.length === 0) return result
    const withPolls = rows.map((row) => row.messageId)
    const shown = rows.filter((row) => !row.anonymous).map((row) => row.messageId)
    const [answers, counts, voters, mine, sampled] = await Promise.all([
      db
        .select()
        .from(pollAnswers)
        .where(inArray(pollAnswers.messageId, withPolls))
        .orderBy(asc(pollAnswers.answerId)),
      db
        .select({ messageId: pollVotes.messageId, answerId: pollVotes.answerId, n: count() })
        .from(pollVotes)
        .where(inArray(pollVotes.messageId, withPolls))
        .groupBy(pollVotes.messageId, pollVotes.answerId),
      db
        .select({ messageId: pollVotes.messageId, n: countDistinct(pollVotes.userId) })
        .from(pollVotes)
        .where(inArray(pollVotes.messageId, withPolls))
        .groupBy(pollVotes.messageId),
      viewerId
        ? db
            .select({ messageId: pollVotes.messageId, answerId: pollVotes.answerId })
            .from(pollVotes)
            .where(and(inArray(pollVotes.messageId, withPolls), eq(pollVotes.userId, viewerId)))
        : [],
      samples(shown),
    ])
    const at = now().getTime()
    for (const row of rows) {
      const countOf = (answerId: number) =>
        counts.find((c) => c.messageId === row.messageId && c.answerId === answerId)?.n ?? 0
      const isMine = (answerId: number) =>
        mine.some((m) => m.messageId === row.messageId && m.answerId === answerId)
      const sampleOf = (answerId: number): PublicUser[] =>
        sampled
          .filter((s) => s.messageId === row.messageId && s.answerId === answerId)
          .map((s) => toPublicUser(s.user as UserRow))
      result.set(row.messageId, {
        question: row.question,
        multiple: row.multiple,
        expiresAt: row.expiresAt.toISOString(),
        ended: row.endedAt !== null || row.expiresAt.getTime() <= at,
        voters: voters.find((v) => v.messageId === row.messageId)?.n ?? 0,
        anonymous: row.anonymous,
        answers: answers
          .filter((a) => a.messageId === row.messageId)
          .map((a) => ({
            id: a.answerId,
            text: a.text,
            count: countOf(a.answerId),
            me: isMine(a.answerId),
            sample: sampleOf(a.answerId),
          })),
      })
    }
    return result
  }

  return {
    summaries,

    async find(messageId: Snowflake): Promise<(PollRow & { answerIds: number[] }) | null> {
      const [row] = await db.select().from(polls).where(eq(polls.messageId, messageId))
      if (!row) return null
      const answers = await db
        .select({ answerId: pollAnswers.answerId })
        .from(pollAnswers)
        .where(eq(pollAnswers.messageId, messageId))
      return { ...row, answerIds: answers.map((a) => a.answerId) }
    },

    /** Replaces the user's answers (none takes the vote back). */
    async vote(messageId: Snowflake, userId: Snowflake, answerIds: readonly number[]) {
      await db.transaction(async (tx) => {
        await tx
          .delete(pollVotes)
          .where(and(eq(pollVotes.messageId, messageId), eq(pollVotes.userId, userId)))
        if (answerIds.length > 0) {
          await tx
            .insert(pollVotes)
            .values(answerIds.map((answerId) => ({ messageId, answerId, userId })))
        }
      })
    },

    /** Who picked an answer, a page at a time in id order. */
    async voters(
      messageId: Snowflake,
      answerId: number,
      { after, limit }: { after?: Snowflake | undefined; limit: number },
    ): Promise<PublicUser[]> {
      const rows = await db
        .select({ user: users })
        .from(pollVotes)
        .innerJoin(users, eq(users.id, pollVotes.userId))
        .where(
          and(
            eq(pollVotes.messageId, messageId),
            eq(pollVotes.answerId, answerId),
            ...(after ? [gt(pollVotes.userId, after)] : []),
          ),
        )
        .orderBy(asc(pollVotes.userId))
        .limit(limit)
      return rows.map((row) => toPublicUser(row.user as UserRow))
    },

    async end(messageId: Snowflake): Promise<void> {
      await db.update(polls).set({ endedAt: now() }).where(eq(polls.messageId, messageId))
    },
  }
}

export type PollRepository = ReturnType<typeof createPollRepository>
