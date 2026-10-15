import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from './user.schemas'

/**
 * How I relate to another user. Requests are stored on both sides (`pending_out` for the one
 * who asked, `pending_in` for the one asked); blocking is one-sided.
 */
export const relationshipTypeSchema = z.enum(['friend', 'pending_out', 'pending_in', 'blocked'])

export const relationshipSchema = z.object({
  user: publicUserSchema,
  type: relationshipTypeSchema,
  since: z.iso.datetime(),
})

/** A friend request by username (as people tell each other their name). */
export const friendRequestSchema = z.strictObject({
  username: z.string().trim().min(1).max(32),
})

/** Accept or send a request (`friend`), or block (`blocked`), by user id. */
export const putRelationshipSchema = z.strictObject({
  type: z.enum(['friend', 'blocked']),
})

export type RelationshipType = z.infer<typeof relationshipTypeSchema>
export type Relationship = z.infer<typeof relationshipSchema>
export type FriendRequest = z.infer<typeof friendRequestSchema>
export type PutRelationship = z.infer<typeof putRelationshipSchema>

export const relationshipRemoveSchema = z.object({ userId: snowflakeSchema })
