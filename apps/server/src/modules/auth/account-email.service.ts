import { publishRevokedSessions } from '../../events/internal-events'
import { badRequest, conflict } from '../../http/http-error'
import { passwordResetEmail, verificationEmail } from '../../mail/templates'
import { hashPassword } from './password'
import { generateSessionToken, hashSessionToken } from './session-token'

import type { EventBus } from '../../events/event-bus'
import type { Mailer, MailMessage } from '../../mail/mailer'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { EmailTokenPurpose, EmailTokenRepository } from './email-token.repository'
import type { SessionRepository } from './session.repository'
import type { Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

const HOUR_MS = 60 * 60 * 1000
const TOKEN_TTL_MS: Readonly<Record<EmailTokenPurpose, number>> = {
  verify_email: 24 * HOUR_MS,
  reset_password: HOUR_MS,
}

export interface AccountEmailServiceDeps {
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly emailTokens: EmailTokenRepository
  readonly mailer: Mailer
  readonly log: FastifyBaseLogger
  readonly publicUrl: string
  readonly nextId: () => Snowflake
  readonly events: EventBus
  readonly now?: () => Date
  /** A reset proves who owns the account: failed sign-ins no longer count against it. */
  readonly onPasswordReset?: (userId: Snowflake) => Promise<void>
}

const invalidToken = () => badRequest('INVALID_TOKEN', 'The link is invalid or has expired')

/** Email verification and password reset, both driven by one-time emailed tokens. */
export const createAccountEmailService = ({
  users,
  sessions,
  emailTokens,
  mailer,
  log,
  publicUrl,
  nextId,
  events,
  now = () => new Date(),
  onPasswordReset = async () => undefined,
}: AccountEmailServiceDeps) => {
  const issueToken = async (userId: Snowflake, purpose: EmailTokenPurpose): Promise<string> => {
    // Same 256-bit generator as session tokens; only the hash is stored.
    const { token, tokenHash } = generateSessionToken()
    await emailTokens.insert({
      id: nextId(),
      userId,
      purpose,
      tokenHash,
      expiresAt: new Date(now().getTime() + TOKEN_TTL_MS[purpose]),
    })
    return token
  }

  /** Delivery happens in the background so SMTP latency never shows up in response times. */
  const dispatch = (message: MailMessage): void => {
    mailer.send(message).catch((error: unknown) => {
      log.error({ err: error, subject: message.subject }, 'Failed to send email')
    })
  }

  const link = (path: string, token: string) => `${publicUrl}${path}?token=${token}`

  const sendVerification = async (user: UserRow): Promise<void> => {
    const token = await issueToken(user.id, 'verify_email')
    dispatch(verificationEmail(user.email, user.username, link('/verify-email', token)))
  }

  return {
    sendVerification,

    async resendVerification(user: UserRow): Promise<void> {
      if (user.emailVerifiedAt) {
        throw conflict('EMAIL_ALREADY_VERIFIED', 'Email is already verified')
      }
      await sendVerification(user)
    },

    async verifyEmail(token: string): Promise<UserRow> {
      const current = now()
      const userId = await emailTokens.consume(hashSessionToken(token), 'verify_email', current)
      const user = userId ? await users.markEmailVerified(userId, current) : null
      if (!user) throw invalidToken()
      return user
    },

    /**
     * Never reveals whether the email is registered: callers respond immediately and run this in
     * the background, and unknown addresses simply produce no email.
     */
    async forgotPassword(email: string): Promise<void> {
      const user = await users.findByEmail(email)
      if (!user) return
      const token = await issueToken(user.id, 'reset_password')
      dispatch(passwordResetEmail(user.email, user.username, link('/reset-password', token)))
    },

    /** Sets a new password and signs the user out everywhere. */
    async resetPassword(token: string, password: string): Promise<void> {
      const current = now()
      const userId = await emailTokens.consume(hashSessionToken(token), 'reset_password', current)
      if (!userId) throw invalidToken()
      // Older reset links in the inbox would still set a password: none of them work now.
      await emailTokens.discardUnused(userId, 'reset_password', current)

      await users.updatePasswordHash(userId, await hashPassword(password))
      await sessions.deleteAllForUser(userId)
      await publishRevokedSessions(events, userId, { scope: 'all' })
      // Following the emailed link proves ownership of the inbox.
      await users.markEmailVerified(userId, current)
      await onPasswordReset(userId)
    },
  }
}

export type AccountEmailService = ReturnType<typeof createAccountEmailService>
