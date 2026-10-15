import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { relationshipTypeSchema } from './relationship.schemas'
import { publicUserSchema } from './user.schemas'

/** "About me", like Discord's: short enough for a profile card. */
export const BIO_MAX_LENGTH = 190
export const NICKNAME_MAX_LENGTH = 32

export const bioSchema = z.string().trim().max(BIO_MAX_LENGTH)

/** Someone's profile as one viewer may see it. */
export const userProfileSchema = z.object({
  user: publicUserSchema,
  bio: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Wide picture at the top of the profile card; null shows the accent colour. */
  bannerUrl: z.string().nullable(),
  accentColor: z.number().int().nullable(),
  /** The viewer's relationship with them (friend, request, block), if any. */
  relationship: relationshipTypeSchema.nullable(),
  /** Servers both are in. */
  mutualGuildIds: z.array(snowflakeSchema),
  mutualFriends: z.array(publicUserSchema),
  /** Their membership in the server the profile was opened from, if both are in it. */
  member: z
    .object({
      nickname: z.string().nullable(),
      roleIds: z.array(snowflakeSchema),
      joinedAt: z.iso.datetime(),
    })
    .nullable(),
})

/** A server nickname; empty or null goes back to the user's own name. */
export const memberNicknameRequestSchema = z.strictObject({
  nickname: z
    .string()
    .trim()
    .max(NICKNAME_MAX_LENGTH)
    .nullable()
    .transform((value) => (value ? value : null)),
})

export type UserProfile = z.infer<typeof userProfileSchema>
export type MemberNicknameRequest = z.input<typeof memberNicknameRequestSchema>
