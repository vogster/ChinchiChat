import { publishRevokedSessions } from '../../events/internal-events'
import { HttpError, badRequest, conflict, unauthorized } from '../../http/http-error'
import { loginThrottleKey } from './login-throttle'
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes'
import { createSecretBox, isSealed } from './secret-box'
import { generateTotpSecret, totpUri, verifyTotp } from './totp'

import { confirmPassword } from './reauth'
import type { EventBus } from '../../events/event-bus'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { SessionRepository } from './session.repository'
import type { LoginThrottle } from './login-throttle'
import type { MfaTickets } from './mfa-tickets'
import type { MfaRepository } from './mfa.repository'
import type { SecretBox } from './secret-box'
import type { Snowflake, TotpSetup } from '@chinchi/shared'

export interface MfaServiceDeps {
  readonly users: Pick<UserRepository, 'findById'>
  readonly mfa: MfaRepository
  readonly tickets: MfaTickets
  readonly loginThrottle: LoginThrottle
  readonly sessions: Pick<SessionRepository, 'deleteOthersForUser'>
  readonly events: EventBus
  /** Seals TOTP secrets at rest; without a key (tests, old installs) they are stored as is. */
  readonly box?: SecretBox
  readonly now?: () => Date
}

/** Shown in authenticator apps next to the account name. */
const ISSUER = 'Chinchi'

const invalidCode = () => badRequest('INVALID_MFA_CODE', 'The code is wrong or was already used')
const locked = () => new HttpError(429, 'LOGIN_LOCKED', 'Too many failed attempts, try again later')
const wrongPassword = () =>
  new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')

/** Authenticator-app (TOTP) second factor with recovery codes. */
export const createMfaService = ({
  users,
  mfa,
  tickets,
  loginThrottle,
  sessions,
  events,
  box = createSecretBox(undefined),
  now = () => new Date(),
}: MfaServiceDeps) => {
  /** The current row: the one from the session may predate a change. */
  const fresh = async (userId: Snowflake): Promise<UserRow> => {
    const user = await users.findById(userId)
    if (!user) throw unauthorized()
    return user
  }

  /** Spends an app code or a recovery code; each works once, even under concurrent use. */
  const spendCode = async (user: UserRow, code: string): Promise<boolean> => {
    if (!user.totpSecret) return false
    if (/^\d{6}$/.test(code)) {
      const secret = box.open(user.totpSecret)
      const step = verifyTotp(secret, code, now().getTime(), user.totpLastStep)
      if (step === null || !(await mfa.useStep(user.id, step))) return false
      // A secret from before SECRETS_KEY existed is sealed the first time it proves right.
      if (box.enabled && !isSealed(user.totpSecret)) {
        await mfa.reseal(user.id, user.totpSecret, box.seal(secret))
      }
      return true
    }
    return mfa.useRecoveryCode(user.id, hashRecoveryCode(code), now())
  }

  /**
   * Spends a code against the account's attempt budget: the attempt is counted first,
   * so simultaneous guesses can't outrun the lock.
   */
  const spendCounted = async (user: UserRow, code: string): Promise<boolean> => {
    const key = loginThrottleKey.mfa(user.id)
    if (!(await loginThrottle.take(key))) throw locked()
    if (!(await spendCode(user, code))) return false
    await loginThrottle.reset(key)
    return true
  }

  /** Password and a code, for turning 2FA off or renewing recovery codes. */
  const confirmBoth = async (userId: Snowflake, password: string, code: string) => {
    const user = await fresh(userId)
    if (!user.totpSecret) throw badRequest('MFA_NOT_ENABLED', 'Two-factor sign-in is off')
    if (!(await confirmPassword(loginThrottle, user, password))) throw wrongPassword()
    if (!(await spendCounted(user, code))) throw invalidCode()
    return user
  }

  const newCodes = () => {
    const codes = generateRecoveryCodes()
    return { codes, hashes: codes.map(hashRecoveryCode) }
  }

  return {
    async setup(userId: Snowflake, password: string): Promise<TotpSetup> {
      const user = await fresh(userId)
      if (user.totpSecret) throw conflict('MFA_ALREADY_ENABLED', 'Two-factor sign-in is on')
      if (!(await confirmPassword(loginThrottle, user, password))) throw wrongPassword()
      const secret = generateTotpSecret()
      await mfa.setPendingSecret(user.id, box.seal(secret))
      return { secret, uri: totpUri(secret, user.username, ISSUER) }
    },

    /**
     * Confirms the app has the secret; returns the recovery codes (shown only now).
     * People turn 2FA on when they fear a leak, so other sessions end.
     */
    async enable(userId: Snowflake, sessionId: Snowflake, code: string): Promise<string[]> {
      const user = await fresh(userId)
      if (user.totpSecret) throw conflict('MFA_ALREADY_ENABLED', 'Two-factor sign-in is on')
      const pending = user.totpPendingSecret
      if (!pending) throw badRequest('MFA_SETUP_REQUIRED', 'Start the setup first')
      const secret = box.open(pending)
      const step = verifyTotp(secret, code, now().getTime(), null)
      if (step === null) throw invalidCode()
      const { codes, hashes } = newCodes()
      if (!(await mfa.enable(user.id, pending, box.seal(secret), step, hashes))) {
        throw invalidCode()
      }
      await sessions.deleteOthersForUser(user.id, sessionId)
      await publishRevokedSessions(events, user.id, { scope: 'allExcept', sessionId })
      return codes
    },

    async disable(userId: Snowflake, password: string, code: string): Promise<void> {
      const user = await confirmBoth(userId, password, code)
      await mfa.disable(user.id)
    },

    async renewRecoveryCodes(userId: Snowflake, password: string, code: string) {
      const user = await confirmBoth(userId, password, code)
      const { codes, hashes } = newCodes()
      await mfa.replaceRecoveryCodes(user.id, hashes)
      return codes
    },

    /** The password was right; the sign-in continues with this ticket. */
    startLogin: (user: UserRow) => tickets.create(user.id),

    /** Spends a code for a sensitive action (counted against the account's attempts). */
    verify: (user: UserRow, code: string) => spendCounted(user, code),

    /** Finishes a sign-in; wrong codes count toward the account's lockout. */
    async completeLogin(ticket: string, code: string): Promise<UserRow> {
      const userId = await tickets.find(ticket)
      if (!userId) throw unauthorized('INVALID_MFA_TICKET', 'Sign in again')
      const user = await fresh(userId)
      let spent: boolean
      try {
        spent = await spendCounted(user, code)
      } catch (error) {
        await tickets.revoke(ticket)
        throw error
      }
      if (!spent) throw unauthorized('INVALID_MFA_CODE', 'The code is wrong or was already used')
      await tickets.revoke(ticket)
      return user
    },
  }
}

export type MfaService = ReturnType<typeof createMfaService>
