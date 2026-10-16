import { createLogMailer } from '../mail/mailer'
import { createAccountEmailService } from '../modules/auth/account-email.service'
import { createAuthService } from '../modules/auth/auth.service'
import { createEmailTokenRepository } from '../modules/auth/email-token.repository'
import { createMemoryLoginThrottle, createRedisLoginThrottle } from '../modules/auth/login-throttle'
import { createMfaRepository } from '../modules/auth/mfa.repository'
import { createMfaService } from '../modules/auth/mfa.service'
import { createMemoryMfaTickets, createRedisMfaTickets } from '../modules/auth/mfa-tickets'
import { createSecretBox } from '../modules/auth/secret-box'

import type { Config } from '../config/env'
import type { Database } from '../db/client'
import type { EventBus } from '../events/event-bus'
import type { Mailer } from '../mail/mailer'
import type { AdminRepository } from '../modules/admin/admin.repository'
import type {
  InstanceInviteRepository,
  InstanceSettingsStore,
} from '../modules/admin/instance-settings'
import type { SessionRepository } from '../modules/auth/session.repository'
import type { UserRepository } from '../modules/users/user.repository'
import type { Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

export interface AccountServiceDeps {
  readonly config: Config
  readonly db: Database
  readonly events: EventBus
  readonly redis: Redis | undefined
  readonly mailer: Mailer | undefined
  readonly log: FastifyBaseLogger
  readonly nextId: () => Snowflake
  readonly users: UserRepository
  readonly sessions: SessionRepository
  readonly instanceSettings: InstanceSettingsStore
  readonly instanceInvites: InstanceInviteRepository
  readonly adminRows: AdminRepository
}

/** Signing up and in, the second factor, and the emails an account gets. */
export const createAccountServices = ({
  config,
  db,
  events,
  redis,
  mailer,
  log,
  nextId,
  users,
  sessions,
  instanceSettings,
  instanceInvites,
  adminRows,
}: AccountServiceDeps) => {
  const loginThrottle = redis ? createRedisLoginThrottle(redis) : createMemoryLoginThrottle()
  const mfa = createMfaService({
    users,
    mfa: createMfaRepository(db),
    tickets: redis ? createRedisMfaTickets(redis) : createMemoryMfaTickets(),
    loginThrottle,
    sessions,
    events,
    box: createSecretBox(config.secretsKey),
  })
  const auth = createAuthService({
    users,
    sessions,
    nextId,
    events,
    sessionTtlDays: config.sessionTtlDays,
    registration: {
      mode: async () => (await instanceSettings.get()).registrationMode,
      consumeInvite: (code) => instanceInvites.consume(code, new Date()),
      releaseInvite: (code) => instanceInvites.release(code),
      isInitialAdmin: async (email) =>
        config.initialAdminEmail === email && !(await adminRows.hasAdmin()),
      async promote(user) {
        if (!config.initialAdminEmail) return adminRows.promoteIfFirst(user.id)
        if (user.email !== config.initialAdminEmail) return false
        return adminRows.promoteIfNoAdmin(user.id)
      },
    },
    loginThrottle,
    mfa,
    onPasswordChanged: (userId) =>
      createEmailTokenRepository(db).discardUnused(userId, 'reset_password', new Date()),
    // Reached at request time, once the email service below exists.
    onAccountLocked: (login) => accountEmails.notifyLockout(login),
  })
  const accountEmails = createAccountEmailService({
    users,
    sessions,
    emailTokens: createEmailTokenRepository(db),
    mailer: mailer ?? createLogMailer(log),
    log,
    publicUrl: config.publicUrl,
    nextId,
    events,
    // The second factor's count stays: a reset by email mustn't buy new code guesses.
    onPasswordReset: async (userId) => {
      const user = await users.findById(userId)
      if (!user) return
      await loginThrottle.resetLogin(user.username)
      await loginThrottle.resetLogin(user.email)
    },
  })
  return { loginThrottle, mfa, auth, accountEmails }
}
