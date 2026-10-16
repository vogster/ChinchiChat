import {
  CUSTOM_STATUS_MAX_DAYS,
  customStatusSchema,
  setCustomStatusRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { ok } from '../../http/responses'
import { badRequest } from '../../http/http-error'
import { requireHuman } from '../auth/auth.plugin'

import type { PresenceService } from '../../gateway/presence'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface CustomStatusRoutesOptions {
  readonly presence: Pick<PresenceService, 'setCustom'>
  readonly now?: () => number
}

const MAX_MS = CUSTOM_STATUS_MAX_DAYS * 86_400_000

/** A line under my name ("🏖 On holiday"); it lives with the presence, in Valkey. */
export const customStatusRoutes: FastifyPluginAsyncZod<CustomStatusRoutesOptions> = async (
  app,
  { presence, now = Date.now },
) => {
  app.put(
    '/users/@me/custom-status',
    {
      schema: {
        body: setCustomStatusRequestSchema,
        response: { 200: ok(z.object({ customStatus: customStatusSchema })) },
      },
    },
    async (request) => {
      const { text, emoji, expiresAt } = request.body
      if (expiresAt) {
        const left = Date.parse(expiresAt) - now()
        if (left <= 0 || left > MAX_MS) {
          throw badRequest('INVALID_STATUS_END', 'A status must end within a month from now')
        }
      }
      const customStatus = {
        text: text || null,
        emoji: emoji ?? null,
        expiresAt: expiresAt ?? null,
      }
      await presence.setCustom(requireHuman(request).user.id, customStatus)
      return { success: true as const, data: { customStatus } }
    },
  )

  app.delete('/users/@me/custom-status', async (request, reply) => {
    await presence.setCustom(requireHuman(request).user.id, null)
    return reply.status(204).send()
  })
}
