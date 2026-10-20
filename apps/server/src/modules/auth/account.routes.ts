import {
  changeEmailRequestSchema,
  confirmEmailChangeRequestSchema,
  currentUserSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { FAIL_CLOSED } from '../../http/rate-limit'
import { toCurrentUser } from '../users/user.mapper'
import { requireAuth, requireHuman } from './auth.plugin'
import { confirmIdentity } from './reauth'

import type { AccountEmailService } from './account-email.service'
import type { LoginThrottle } from './login-throttle'
import type { MfaService } from './mfa.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AccountRoutesOptions {
  readonly accountEmails: AccountEmailService
  /** For changing the email: the password and, with 2FA on, a code. */
  readonly loginThrottle: LoginThrottle
  readonly mfa: Pick<MfaService, 'verify'>
}

const HOUR_MS = 60 * 60 * 1000

const userResponse = z.object({
  success: z.literal(true),
  data: z.object({ user: currentUserSchema }),
})

const emptyResponse = z.object({ success: z.literal(true), data: z.null() })

export const accountRoutes: FastifyPluginAsyncZod<AccountRoutesOptions> = async (
  app,
  { accountEmails, loginThrottle, mfa },
) => {
  app.post(
    '/auth/verify-email',
    {
      schema: { body: verifyEmailRequestSchema, response: { 200: userResponse } },
      config: { rateLimit: { max: 20, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request) => {
      const user = await accountEmails.verifyEmail(request.body.token)
      return { success: true as const, data: { user: toCurrentUser(user) } }
    },
  )

  app.post(
    '/auth/verify-email/resend',
    {
      schema: { response: { 202: emptyResponse } },
      config: { rateLimit: { max: 3, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request, reply) => {
      await accountEmails.resendVerification(requireAuth(request).user)
      return reply.status(202).send({ success: true as const, data: null })
    },
  )

  app.post(
    '/auth/password/forgot',
    {
      schema: { body: forgotPasswordRequestSchema, response: { 202: emptyResponse } },
      config: { rateLimit: { max: 5, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request, reply) => {
      // Respond before doing any work so timing does not reveal whether the account exists.
      accountEmails.forgotPassword(request.body.email).catch((error: unknown) => {
        request.log.error({ err: error }, 'Password reset request failed')
      })
      return reply.status(202).send({ success: true as const, data: null })
    },
  )

  app.post(
    '/auth/password/reset',
    {
      schema: { body: resetPasswordRequestSchema, response: { 200: emptyResponse } },
      config: { rateLimit: { max: 10, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request) => {
      await accountEmails.resetPassword(request.body.token, request.body.password)
      return { success: true as const, data: null }
    },
  )

  app.post(
    '/users/@me/email',
    {
      schema: { body: changeEmailRequestSchema, response: { 202: emptyResponse } },
      // Checks a password and sends mail: fail closed.
      config: { rateLimit: { max: 5, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request, reply) => {
      const { user } = requireHuman(request)
      const { email, password, code } = request.body
      await confirmIdentity({ throttle: loginThrottle, mfa }, user, password, code)
      await accountEmails.requestEmailChange(user, email)
      return reply.status(202).send({ success: true as const, data: null })
    },
  )

  app.post(
    '/auth/email/confirm',
    {
      schema: { body: confirmEmailChangeRequestSchema, response: { 200: userResponse } },
      config: { rateLimit: { max: 20, timeWindow: HOUR_MS, ...FAIL_CLOSED } },
    },
    async (request) => {
      const user = await accountEmails.confirmEmailChange(request.body.token)
      return { success: true as const, data: { user: toCurrentUser(user) } }
    },
  )
}
