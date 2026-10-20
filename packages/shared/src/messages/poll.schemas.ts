import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

export const POLL_QUESTION_MAX = 300
export const POLL_ANSWER_MAX = 55
export const POLL_ANSWERS_MIN = 2
export const POLL_ANSWERS_MAX = 10
/** How long a poll may stay open, as in Discord: an hour to a week. */
export const POLL_DURATIONS_HOURS = [1, 4, 8, 24, 72, 168] as const
/** Voters shown with each answer (as a stack of avatars); the rest are a request away. */
export const POLL_VOTER_SAMPLE = 3
export const POLL_VOTERS_PAGE_MAX = 100

const durationSchema = z.union(POLL_DURATIONS_HOURS.map((hours) => z.literal(hours)))

/** A poll sent with a message (it can be the whole message). */
export const createPollSchema = z.strictObject({
  question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
  answers: z
    .array(z.string().trim().min(1).max(POLL_ANSWER_MAX))
    .min(POLL_ANSWERS_MIN)
    .max(POLL_ANSWERS_MAX),
  /** Several answers per person instead of one. */
  multiple: z.boolean().default(false),
  durationHours: durationSchema.default(24),
  /** Nobody sees who voted for what, only the counts. */
  anonymous: z.boolean().default(false),
})

export const pollAnswerSchema = z.object({
  /** 1-based, in the order the answers were written. */
  id: z.number().int().positive(),
  text: z.string(),
  /** Votes for it; per viewer, `me` says whether one is theirs. */
  count: z.number().int().nonnegative(),
  me: z.boolean(),
  /** A few who picked it, for the avatars; always empty in an anonymous poll. */
  sample: z.array(publicUserSchema),
})

export const pollSchema = z.object({
  question: z.string(),
  answers: z.array(pollAnswerSchema),
  multiple: z.boolean(),
  expiresAt: z.iso.datetime(),
  /** Over: expired, or ended early by its author. No more votes. */
  ended: z.boolean(),
  /** People who voted (with several answers, one person counts once). */
  voters: z.number().int().nonnegative(),
  anonymous: z.boolean(),
})

/** A page of the people who picked an answer, in id order: `after` is the last id seen. */
export const pollVotersQuerySchema = z.object({
  after: snowflakeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(POLL_VOTERS_PAGE_MAX).default(50),
})

/** My answers, replacing any I gave before; an empty list takes my vote back. */
export const pollVoteRequestSchema = z.strictObject({
  answerIds: z
    .array(z.number().int().min(1).max(POLL_ANSWERS_MAX))
    .max(POLL_ANSWERS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate answer'),
})

/** New counts for everyone (`me` is false in the broadcast copy: keep your own). */
export const pollUpdateEventSchema = z.object({
  channelId: snowflakeSchema,
  guildId: snowflakeSchema.nullable(),
  messageId: snowflakeSchema,
  poll: pollSchema,
})

export type CreatePoll = z.input<typeof createPollSchema>
export type Poll = z.infer<typeof pollSchema>
export type PollAnswer = z.infer<typeof pollAnswerSchema>
export type PollUpdateEvent = z.infer<typeof pollUpdateEventSchema>
export type PollVotersQuery = z.input<typeof pollVotersQuerySchema>
