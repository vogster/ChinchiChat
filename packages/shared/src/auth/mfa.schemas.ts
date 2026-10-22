import { z } from 'zod'

import { currentUserSchema } from '../users/user.schemas'
import { PASSWORD_MAX_LENGTH } from './auth.schemas'

/** Recovery codes: ten base32 letters, shown as "abcde-fghij". */
export const RECOVERY_CODE_PATTERN = /^[a-z2-7]{5}-[a-z2-7]{5}$/
export const RECOVERY_CODE_COUNT = 10

const withoutSpaces = (value: string) => value.replace(/\s+/g, '')

/** The six digits an authenticator app shows. */
export const totpCodeSchema = z
  .string()
  .max(32)
  .transform(withoutSpaces)
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'))

/** A second-step code: from the app, or one of the recovery codes. */
export const mfaCodeSchema = z
  .string()
  .max(32)
  .transform((value) => {
    const compact = withoutSpaces(value).toLowerCase()
    if (/^[a-z2-7]{10}$/.test(compact)) return `${compact.slice(0, 5)}-${compact.slice(5)}`
    return compact
  })
  .pipe(
    z
      .string()
      .refine(
        (value) => /^\d{6}$/.test(value) || RECOVERY_CODE_PATTERN.test(value),
        'Enter the 6-digit code or a recovery code',
      ),
  )

const passwordField = z.string().min(1).max(PASSWORD_MAX_LENGTH)

export const mfaTicketSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid ticket')

export const totpSetupRequestSchema = z.strictObject({ password: passwordField })
export const totpEnableRequestSchema = z.strictObject({ code: totpCodeSchema })
/** Turning 2FA off or making new recovery codes asks for both factors. */
export const mfaConfirmRequestSchema = z.strictObject({
  password: passwordField,
  code: mfaCodeSchema,
})
export const mfaLoginRequestSchema = z.strictObject({
  ticket: mfaTicketSchema,
  code: mfaCodeSchema,
})

export const totpSetupSchema = z.object({
  /** Base32, for typing into the app by hand. */
  secret: z.string(),
  /** `otpauth://` link, shown as a QR code. */
  uri: z.string(),
})

export const recoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) })

/** Signing in either finishes, or asks for the second factor with a short-lived ticket. */
export const loginResultSchema = z.union([
  z.object({ user: currentUserSchema, token: z.string().optional() }),
  z.object({ mfaTicket: z.string() }),
])

export type TotpSetup = z.infer<typeof totpSetupSchema>
export type MfaConfirmRequest = z.infer<typeof mfaConfirmRequestSchema>
export type MfaLoginRequest = z.input<typeof mfaLoginRequestSchema>
export type LoginResult = z.infer<typeof loginResultSchema>

/** Deleting your own account takes your password, whatever device you're signed in on. */
export const deleteAccountRequestSchema = z.strictObject({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  /** Required when two-factor sign-in is on: an authenticator or recovery code. */
  code: mfaCodeSchema.optional(),
})

/** Downloading all your data takes the same: the password, and a code with 2FA on. */
export const exportDataRequestSchema = deleteAccountRequestSchema

/** A one-time ticket for the download that follows (`GET /users/@me/export/:ticket`). */
export const exportTicketSchema = z.object({ ticket: z.string() })
