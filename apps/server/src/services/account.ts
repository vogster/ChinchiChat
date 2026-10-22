import { userTopic } from '../events/event-bus'
import { createLogMailer } from '../mail/mailer'
import { createAccountEmailService } from '../modules/auth/account-email.service'
import { createAuthService } from '../modules/auth/auth.service'
import { createEmailTokenRepository } from '../modules/auth/email-token.repository'
import { createMemoryLoginThrottle, createRedisLoginThrottle } from '../modules/auth/login-throttle'
import { createMfaRepository } from '../modules/auth/mfa.repository'
import { createMfaService } from '../modules/auth/mfa.service'
import { createMemoryMfaTickets, createRedisMfaTickets } from '../modules/auth/mfa-tickets'
import { createQrLoginService } from '../modules/auth/qr-login.service'
import { createMemoryQrLoginStore, createRedisQrLoginStore } from '../modules/auth/qr-login.store'
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
  /** Where the first admin's confirmation link goes without SMTP; the log by default. */
  readonly reportFirstAdminLink?: ((link: string) => void) | undefined
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
  reportFirstAdminLink = (link) =>
    log.warn(
      `FIRST ADMIN LINK: open it to confirm ${config.initialAdminEmail} and become the instance admin (SMTP_URL is not set, so it was not emailed): ${link}`,
    ),
}: AccountServiceDeps) => {
  /** The address INITIAL_ADMIN_EMAIL names: its owner runs the instance, once proven. */
  const designated = (email: string) =>
    config.initialAdminEmail !== undefined && config.initialAdminEmail === email
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
      isInitialAdmin: async (email) => designated(email) && !(await adminRows.hasAdmin()),
      // With a designated address, knowing it is not enough: its owner becomes admin once the
      // email is confirmed (below), so nobody takes the instance by registering first with it.
      promote: async (user) =>
        config.initialAdminEmail ? false : adminRows.promoteIfFirst(user.id),
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
    onEmailConfirmed: async (user) => designated(user.email) && adminRows.promoteIfNoAdmin(user.id),
    // Without SMTP the first admin could never confirm: their link (theirs only, as long as the
    // instance has no admin) goes to the log, which only the one running the server reads.
    ...(mailer
      ? {}
      : {
          revealVerificationLink: async (user, verifyLink) => {
            if (designated(user.email) && !(await adminRows.hasAdmin())) {
              reportFirstAdminLink(verifyLink)
            }
          },
        }),
  })
  const qrLogin = createQrLoginService({
    store: redis ? createRedisQrLoginStore(redis) : createMemoryQrLoginStore(),
    signInAs: (userId, client) => auth.signInAs(userId, client),
    publicUrl: config.publicUrl,
    onSignedIn: async (userId, event) => {
      await accountEmails.notifyQrSignIn(userId, event)
      await events.publish({ topic: userTopic(userId), type: 'SESSION_CREATE', data: event })
    },
  })
  return { loginThrottle, mfa, auth, accountEmails, qrLogin }
}
