import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

/** How much of the last message a thread's card shows. */
export const THREAD_PREVIEW_LENGTH = 120

/** The newest message of a thread, as its card in the thread list shows it. */
export const threadPreviewSchema = z.object({
  threadId: snowflakeSchema,
  messageId: snowflakeSchema,
  /** Null for a deleted account or a webhook. */
  author: publicUserSchema.nullable(),
  /** The name to show: the nickname on the server, the webhook's name; null if deleted. */
  authorName: z.string().nullable(),
  /** The start of the text, at most `THREAD_PREVIEW_LENGTH` characters. */
  content: z.string(),
  attachmentCount: z.number().int().nonnegative(),
})

export type ThreadPreview = z.infer<typeof threadPreviewSchema>
