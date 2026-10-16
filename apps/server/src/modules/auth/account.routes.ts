import {
  currentUserSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { FAIL_CLOSED } from '../../http/rate-limit'
import { toCurrentUser } from '../users/user.mapper'
import { requireAuth } from './auth.plugin'

import type { AccountEmailService } from './account-email.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AccountRoutesOptions {
  readonly accountEmails: AccountEmailService
}

const HOUR_MS = 60 * 60 * 1000

const userResponse = z.object({
  success: z.literal(true),
  data: z.object({ user: currentUserSchema }),
})

const emptyResponse = z.object({ success: z.literal(true), data: z.null() })

export const accountRoutes: FastifyPluginAsyncZod<AccountRoutesOptions> = async (
  app,
  { accountEmails },
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
}
