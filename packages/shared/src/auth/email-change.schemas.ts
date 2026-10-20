import { z } from 'zod'

import { emailSchema, emailTokenSchema, PASSWORD_MAX_LENGTH } from './auth.schemas'
import { mfaCodeSchema } from './mfa.schemas'

/** A new address for the account: the password, and a code when two-factor sign-in is on. */
export const changeEmailRequestSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  code: mfaCodeSchema.optional(),
})

/** The link sent to the new address confirms it. */
export const confirmEmailChangeRequestSchema = z.strictObject({ token: emailTokenSchema })

export type ChangeEmailRequest = z.input<typeof changeEmailRequestSchema>
export type ConfirmEmailChangeRequest = z.infer<typeof confirmEmailChangeRequestSchema>
