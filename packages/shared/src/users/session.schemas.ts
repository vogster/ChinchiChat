import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** A signed-in device as shown in "Active sessions". */
export const sessionInfoSchema = z.object({
  id: snowflakeSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  current: z.boolean(),
})

export type SessionInfo = z.infer<typeof sessionInfoSchema>
