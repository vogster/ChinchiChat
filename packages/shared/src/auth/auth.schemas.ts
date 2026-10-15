import { z } from 'zod'

export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 32
export const DISPLAY_NAME_MAX_LENGTH = 32
export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

// Lowercase latin letters, digits, "_" and "."; no leading/trailing or doubled dots.
const USERNAME_PATTERN = /^(?!\.)(?!.*\.\.)[a-z0-9_.]+(?<!\.)$/

/** Usernames are unique and case-insensitive, so they are stored lowercased. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN, 'Only latin letters, digits, "_" and "." are allowed')

export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email())

/** Passwords are never trimmed or normalized: what the user typed is what gets hashed. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => value.trim().length > 0, 'Password cannot be only whitespace')

export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH)

export const registerRequestSchema = z.strictObject({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Needed while the instance registers by invite only. */
  inviteCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8,32}$/, 'Invalid invite code')
    .optional(),
})

/** `login` is a username or an email; both are matched case-insensitively. */
export const loginRequestSchema = z.strictObject({
  login: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

/** One-time tokens from emailed links (base64url, 256 bits). */
export const emailTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/, 'Invalid token')

export const verifyEmailRequestSchema = z.strictObject({ token: emailTokenSchema })

export const forgotPasswordRequestSchema = z.strictObject({ email: emailSchema })

export const resetPasswordRequestSchema = z.strictObject({
  token: emailTokenSchema,
  password: passwordSchema,
})

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
})

export type RegisterRequest = z.infer<typeof registerRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
