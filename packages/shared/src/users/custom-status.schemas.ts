import { z } from 'zod'

export const CUSTOM_STATUS_TEXT_MAX = 128
/** How long a custom status may be set for at most. */
export const CUSTOM_STATUS_MAX_DAYS = 30

/** A line under the name ("🏖 On holiday"), shown while the user is not offline. */
export const customStatusSchema = z.object({
  text: z.string().nullable(),
  /** A single emoji (sequences with joiners and skin tones count as one). */
  emoji: z.string().nullable(),
  /** When it clears itself; null keeps it until changed. */
  expiresAt: z.iso.datetime().nullable(),
})

const withoutHiddenCharacters = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, '')

export const setCustomStatusRequestSchema = z
  .strictObject({
    text: z
      .string()
      .transform((value) => withoutHiddenCharacters(value).trim())
      .pipe(z.string().max(CUSTOM_STATUS_TEXT_MAX))
      .nullable()
      .optional(),
    emoji: z
      .string()
      .max(32)
      .regex(/^\p{Extended_Pictographic}/u, 'Not an emoji')
      .nullable()
      .optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
  })
  .refine((body) => Boolean(body.text) || Boolean(body.emoji), 'Text or an emoji is required')

export type CustomStatus = z.infer<typeof customStatusSchema>
export type SetCustomStatusRequest = z.input<typeof setCustomStatusRequestSchema>

/** Whether a custom status is still in effect at `now`. */
export const isCustomStatusActive = (status: CustomStatus | null | undefined, now: number) =>
  status !== null &&
  status !== undefined &&
  (status.expiresAt === null || Date.parse(status.expiresAt) > now)
