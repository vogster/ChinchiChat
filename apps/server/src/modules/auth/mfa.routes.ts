import {
  mfaConfirmRequestSchema,
  recoveryCodesSchema,
  totpEnableRequestSchema,
  totpSetupRequestSchema,
  totpSetupSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { ok } from '../../http/responses'
import { LOGIN_RATE_LIMIT } from '../../http/rate-limit'
import { requireHuman } from './auth.plugin'

import type { MfaService } from './mfa.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface MfaRoutesOptions {
  readonly mfaService: MfaService
}

// Every endpoint here checks a password or a code: same budget as login.
const config = { rateLimit: LOGIN_RATE_LIMIT }

export const mfaRoutes: FastifyPluginAsyncZod<MfaRoutesOptions> = async (app, { mfaService }) => {
  app.post(
    '/users/@me/mfa/totp/setup',
    { schema: { body: totpSetupRequestSchema, response: { 200: ok(totpSetupSchema) } }, config },
    async (request) => ({
      success: true as const,
      data: await mfaService.setup(requireHuman(request).user.id, request.body.password),
    }),
  )

  app.post(
    '/users/@me/mfa/totp/enable',
    {
      schema: { body: totpEnableRequestSchema, response: { 200: ok(recoveryCodesSchema) } },
      config,
    },
    async (request) => {
      const { user, session } = requireHuman(request)
      return {
        success: true as const,
        data: { recoveryCodes: await mfaService.enable(user.id, session.id, request.body.code) },
      }
    },
  )

  app.post(
    '/users/@me/mfa/disable',
    { schema: { body: mfaConfirmRequestSchema, response: { 200: ok(z.null()) } }, config },
    async (request) => {
      const { password, code } = request.body
      await mfaService.disable(requireHuman(request).user.id, password, code)
      return { success: true as const, data: null }
    },
  )

  app.post(
    '/users/@me/mfa/recovery-codes',
    {
      schema: { body: mfaConfirmRequestSchema, response: { 200: ok(recoveryCodesSchema) } },
      config,
    },
    async (request) => {
      const { password, code } = request.body
      const userId = requireHuman(request).user.id
      return {
        success: true as const,
        data: { recoveryCodes: await mfaService.renewRecoveryCodes(userId, password, code) },
      }
    },
  )
}
