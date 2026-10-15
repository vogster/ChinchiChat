import { sessionInfoSchema, snowflakeSchema } from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from './auth.plugin'

import type { AuthService } from './auth.service'
import type { SessionRow } from './session.repository'
import type { SessionInfo } from '@chinchi/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface SessionsRoutesOptions {
  readonly authService: AuthService
}

const listResponse = z.object({
  success: z.literal(true),
  data: z.object({ sessions: z.array(sessionInfoSchema) }),
})

const toSessionInfo = (session: SessionRow, currentId: string): SessionInfo => ({
  id: session.id,
  userAgent: session.userAgent,
  ipAddress: session.ipAddress,
  createdAt: session.createdAt.toISOString(),
  lastUsedAt: session.lastUsedAt.toISOString(),
  current: session.id === currentId,
})

export const sessionsRoutes: FastifyPluginAsyncZod<SessionsRoutesOptions> = async (
  app,
  { authService },
) => {
  app.get('/auth/sessions', { schema: { response: { 200: listResponse } } }, async (request) => {
    const { user, session } = requireAuth(request)
    const list = await authService.listSessions(user.id)
    return {
      success: true as const,
      data: { sessions: list.map((row) => toSessionInfo(row, session.id)) },
    }
  })

  app.delete(
    '/auth/sessions/:id',
    { schema: { params: z.object({ id: snowflakeSchema }) } },
    async (request, reply) => {
      const { user } = requireAuth(request)
      await authService.revokeSession(user.id, request.params.id)
      return reply.status(204).send()
    },
  )

  /** Signs out everywhere except the device making the request. */
  app.delete('/auth/sessions', async (request, reply) => {
    const { user, session } = requireAuth(request)
    await authService.revokeOtherSessions(user.id, session.id)
    return reply.status(204).send()
  })
}
