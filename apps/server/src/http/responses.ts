import { z } from 'zod'

/** The success envelope every endpoint answers with: `{ success: true, data }`. */
export const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })
