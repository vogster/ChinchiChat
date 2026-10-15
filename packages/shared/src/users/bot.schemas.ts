import { z } from 'zod'

import { usernameSchema } from '../auth/auth.schemas'
import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from './user.schemas'

/** Bots one person may own. */
export const MAX_BOTS_PER_OWNER = 10

/** A bot account as its owner sees it (the token is shown only on creation and renewal). */
export const botSchema = z.object({
  user: publicUserSchema,
  ownerId: snowflakeSchema,
  /** Anyone may add a public bot to their server; a private one only its owner. */
  public: z.boolean(),
  createdAt: z.iso.datetime(),
})

export const createBotRequestSchema = z.strictObject({ username: usernameSchema })
export const updateBotRequestSchema = z
  .strictObject({
    public: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(32).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')
export const addBotRequestSchema = z.strictObject({ botId: snowflakeSchema })

export type Bot = z.infer<typeof botSchema>
export type UpdateBotRequest = z.infer<typeof updateBotRequestSchema>
