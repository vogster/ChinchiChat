import { publishRevokedSessions } from '../../events/internal-events'
import { addressBucket } from '../../http/address-bucket'
import { conflict, forbidden, HttpError, unauthorized } from '../../http/http-error'
import {
  createMemoryLoginThrottle,
  loginThrottleKey,
  MAX_FAILED_LOGINS_PER_ACCOUNT,
} from './login-throttle'
import { hashPassword, needsRehash, verifyPassword } from './password'
import { confirmPassword } from './reauth'
import { generateSessionToken, hashSessionToken } from './session-token'

import type { EventBus } from '../../events/event-bus'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { LoginThrottle } from './login-throttle'
import type { MfaService } from './mfa.service'
import type { SessionRepository, SessionRow } from './session.repository'
import type { LoginRequest, RegisterRequest, RegistrationMode, Snowflake } from '@chinchi/shared'

const DAY_MS = 86_400_000
/** Avoid a database write on every request: only refresh activity this often. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000
const USER_AGENT_MAX_LENGTH = 512

export interface ClientInfo {
  readonly userAgent?: string | undefined
  readonly ipAddress?: string | undefined
}

export interface AuthResult {
  readonly user: UserRow
  readonly token: string
}

export interface AuthContext {
  readonly user: UserRow
  readonly session: SessionRow
}

export interface AuthServiceDeps {
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly nextId: () => Snowflake
  readonly now?: () => Date
  readonly sessionTtlDays: number
  /** Registration as the instance is set up right now (admins can change it). */
  readonly registration: Registration
  readonly events: EventBus
  /** Failed sign-ins per account; in memory by default (one process). */
  readonly loginThrottle?: LoginThrottle
  /** Second factor; without it accounts sign in with the password alone. */
  readonly mfa?: Pick<MfaService, 'startLogin' | 'completeLogin'>
  /** After a password change (old reset links stop working). */
  readonly onPasswordChanged?: (userId: Snowflake) => Promise<void>
  /** Sign-in to a login just got locked (once per lock window): the owner is told. */
  readonly onAccountLocked?: (login: string) => Promise<void>
}

/** Signing in either finishes or waits for the second factor. */
export type LoginOutcome = AuthResult | { readonly mfaTicket: string }

export interface Registration {
  mode(): Promise<RegistrationMode>
  /** Takes one use of an instance invite; false when it is invalid or used up. */
  consumeInvite(code: string): Promise<boolean>
  releaseInvite(code: string): Promise<void>
  /** The instance's designated first admin may register before anyone runs it. */
  isInitialAdmin(email: string): Promise<boolean>
  /** Makes the new account an admin if it should run the instance; true if so. */
  promote(user: UserRow): Promise<boolean>
}

const invalidCredentials = () => unauthorized('INVALID_CREDENTIALS', 'Invalid login or password')

export const createAuthService = ({
  users,
  sessions,
  nextId,
  now = () => new Date(),
  sessionTtlDays,
  registration,
  events,
  loginThrottle = createMemoryLoginThrottle(),
  mfa,
  onPasswordChanged = async () => undefined,
  onAccountLocked = async () => undefined,
}: AuthServiceDeps) => {
  const ttlMs = sessionTtlDays * DAY_MS

  // Verifying against a real hash for unknown users keeps response times uniform,
  // so login timing does not reveal which accounts exist.
  const dummyHash = hashPassword('timing-equalizer')

  const startSession = async (user: UserRow, client: ClientInfo): Promise<AuthResult> => {
    const { token, tokenHash } = generateSessionToken()
    await sessions.insert({
      id: nextId(),
      userId: user.id,
      tokenHash,
      userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
      ipAddress: client.ipAddress ?? null,
      expiresAt: new Date(now().getTime() + ttlMs),
    })
    return { user, token }
  }

  return {
    async register(input: RegisterRequest, client: ClientInfo): Promise<AuthResult> {
      const mode = (await registration.isInitialAdmin(input.email))
        ? 'open'
        : await registration.mode()
      if (mode === 'closed') {
        throw forbidden('REGISTRATION_CLOSED', 'Registration is closed on this instance')
      }
      const invite = mode === 'invite' ? input.inviteCode : undefined
      if (mode === 'invite') {
        if (!invite) throw forbidden('INVITE_REQUIRED', 'Registration needs an invite')
        if (!(await registration.consumeInvite(invite))) {
          throw forbidden('INVALID_INVITE', 'The invite is invalid, used up or expired')
        }
      }
      let result: Awaited<ReturnType<UserRepository['insert']>>
      try {
        result = await users.insert({
          id: nextId(),
          username: input.username,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          locale: input.locale ?? 'ru',
        })
      } catch (error) {
        if (invite) await registration.releaseInvite(invite)
        throw error
      }

      if (!result.ok) {
        if (invite) await registration.releaseInvite(invite)
        throw result.reason === 'username_taken'
          ? conflict('USERNAME_TAKEN', 'Username is already taken')
          : conflict('EMAIL_TAKEN', 'Email is already registered')
      }
      const promoted = await registration.promote(result.user)
      return startSession(promoted ? { ...result.user, isAdmin: true } : result.user, client)
    },

    async login(input: LoginRequest, client: ClientInfo): Promise<LoginOutcome> {
      // Counted before checking; unknown logins count the same, so a lock says nothing
      // about whether an account exists.
      // A tight count per address and a loose one per login: a stranger can't lock the owner
      // out from elsewhere, and guessing spread over many addresses still stops.
      const fromHere = loginThrottleKey.loginFrom(
        input.login,
        addressBucket(client.ipAddress ?? 'unknown'),
      )
      const anywhere = loginThrottleKey.login(input.login)
      const [here, overall] = await Promise.all([
        loginThrottle.take(fromHere),
        loginThrottle.take(anywhere, MAX_FAILED_LOGINS_PER_ACCOUNT),
      ])
      if (!here || !overall) {
        // The owner hears about it once per window, whoever is guessing; the reset link in
        // the email lifts the lock if it was them.
        if (await loginThrottle.take(loginThrottleKey.lockoutMail(input.login), 1)) {
          await onAccountLocked(input.login)
        }
        throw new HttpError(429, 'LOGIN_LOCKED', 'Too many failed attempts, try again later')
      }
      const user = await users.findByLogin(input.login)
      const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash), input.password)
      if (!user || !valid) throw invalidCredentials()
      await Promise.all([loginThrottle.reset(fromHere), loginThrottle.reset(anywhere)])
      // Only after the password: a suspension isn't revealed to whoever types a name.
      if (user.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended')
      if (needsRehash(user.passwordHash)) {
        await users.updatePasswordHash(user.id, await hashPassword(input.password))
      }
      if (user.totpSecret) {
        // Never fall back to the password alone for an account that has a second factor.
        if (!mfa) throw new Error('Two-factor sign-in is not configured')
        return { mfaTicket: await mfa.startLogin(user) }
      }
      return startSession(user, client)
    },

    async completeMfaLogin(ticket: string, code: string, client: ClientInfo): Promise<AuthResult> {
      if (!mfa) throw unauthorized('INVALID_MFA_TICKET', 'Sign in again')
      const user = await mfa.completeLogin(ticket, code)
      // Suspended while the code was being typed.
      if (user.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended')
      return startSession(user, client)
    },

    /** Resolves a session token; slides the expiry forward on activity. */
    async authenticate(token: string): Promise<AuthContext | null> {
      const current = now()
      const found = await sessions.findActiveByTokenHash(hashSessionToken(token), current)
      if (!found || found.user.suspendedAt) return null

      if (current.getTime() - found.session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
        // A bot token never expires by inactivity; a person's session slides forward.
        const expiresAt = found.user.isBot
          ? found.session.expiresAt
          : new Date(current.getTime() + ttlMs)
        await sessions.touch(found.session.id, current, expiresAt)
      }
      return found
    },

    async logout({ user, session }: AuthContext): Promise<void> {
      await sessions.delete(session.id)
      await publishRevokedSessions(events, user.id, { scope: 'only', sessionIds: [session.id] })
    },

    listSessions: (userId: Snowflake) => sessions.listActiveForUser(userId, now()),

    async revokeSession(userId: Snowflake, sessionId: Snowflake): Promise<void> {
      if (!(await sessions.deleteOwned(sessionId, userId))) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found')
      }
      await publishRevokedSessions(events, userId, { scope: 'only', sessionIds: [sessionId] })
    },

    async revokeOtherSessions(userId: Snowflake, currentSessionId: Snowflake): Promise<void> {
      await sessions.deleteOthersForUser(userId, currentSessionId)
      await publishRevokedSessions(events, userId, {
        scope: 'allExcept',
        sessionId: currentSessionId,
      })
    },

    /** Requires the current password; signs out every other device afterwards. */
    async changePassword(
      { user, session }: AuthContext,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      if (!(await confirmPassword(loginThrottle, user, currentPassword))) {
        throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
      }
      await users.updatePasswordHash(user.id, await hashPassword(newPassword))
      await onPasswordChanged(user.id)
      await sessions.deleteOthersForUser(user.id, session.id)
      await publishRevokedSessions(events, user.id, { scope: 'allExcept', sessionId: session.id })
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
