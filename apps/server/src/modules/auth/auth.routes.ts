import {
  changePasswordRequestSchema,
  currentUserSchema,
  loginRequestSchema,
  mfaLoginRequestSchema,
  registerRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { LOGIN_RATE_LIMIT, REGISTER_RATE_LIMIT } from '../../http/rate-limit'
import { toCurrentUser } from '../users/user.mapper'
import { requireAuth, requireHuman, SESSION_COOKIE } from './auth.plugin'

import type { AccountEmailService } from './account-email.service'
import type { AuthResult, AuthService, ClientInfo } from './auth.service'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AuthRoutesOptions {
  readonly authService: AuthService
  readonly accountEmails: AccountEmailService
  readonly sessionTtlDays: number
  readonly secureCookies: boolean
}

const authResponse = z.object({
  success: z.literal(true),
  data: z.object({
    user: currentUserSchema,
    /** Only in bearer mode (`X-Auth-Mode: bearer`), for native clients. */
    token: z.string().optional(),
  }),
})

/** Either signed in, or the second step's ticket (no session yet). */
const loginResponse = z.union([
  authResponse,
  z.object({ success: z.literal(true), data: z.object({ mfaTicket: z.string() }) }),
])

const clientInfo = (request: FastifyRequest): ClientInfo => ({
  userAgent: request.headers['user-agent'],
  ipAddress: request.ip,
})

const wantsBearer = (request: FastifyRequest): boolean =>
  request.headers['x-auth-mode'] === 'bearer'

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  { authService, accountEmails, sessionTtlDays, secureCookies },
) => {
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies,
    path: '/',
  } as const

  const sendAuth = (
    request: FastifyRequest,
    reply: FastifyReply,
    status: 200 | 201,
    { user, token }: AuthResult,
  ) => {
    const payload = { success: true as const, data: { user: toCurrentUser(user) } }
    if (wantsBearer(request)) {
      return reply.status(status).send({ ...payload, data: { ...payload.data, token } })
    }
    return reply
      .setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: sessionTtlDays * 86_400 })
      .status(status)
      .send(payload)
  }

  app.post(
    '/auth/register',
    {
      schema: { body: registerRequestSchema, response: { 201: authResponse } },
      config: { rateLimit: REGISTER_RATE_LIMIT },
    },
    async (request, reply) => {
      const result = await authService.register(request.body, clientInfo(request))
      await accountEmails.sendVerification(result.user)
      return sendAuth(request, reply, 201, result)
    },
  )

  app.post(
    '/auth/login',
    {
      schema: { body: loginRequestSchema, response: { 200: loginResponse } },
      config: { rateLimit: LOGIN_RATE_LIMIT },
    },
    async (request, reply) => {
      const outcome = await authService.login(request.body, clientInfo(request))
      if ('mfaTicket' in outcome) {
        return reply.send({ success: true as const, data: { mfaTicket: outcome.mfaTicket } })
      }
      return sendAuth(request, reply, 200, outcome)
    },
  )

  app.post(
    '/auth/login/mfa',
    {
      schema: { body: mfaLoginRequestSchema, response: { 200: authResponse } },
      config: { rateLimit: LOGIN_RATE_LIMIT },
    },
    async (request, reply) => {
      const { ticket, code } = request.body
      const result = await authService.completeMfaLogin(ticket, code, clientInfo(request))
      return sendAuth(request, reply, 200, result)
    },
  )

  app.post('/auth/logout', async (request, reply) => {
    await authService.logout(requireAuth(request))
    return reply.clearCookie(SESSION_COOKIE, cookieOptions).status(204).send()
  })

  app.post(
    '/auth/password/change',
    {
      schema: {
        body: changePasswordRequestSchema,
        response: { 200: z.object({ success: z.literal(true), data: z.null() }) },
      },
      // Same budget as login: this endpoint also checks a password.
      config: { rateLimit: LOGIN_RATE_LIMIT },
    },
    async (request) => {
      const { currentPassword, newPassword } = request.body
      await authService.changePassword(requireHuman(request), currentPassword, newPassword)
      return { success: true as const, data: null }
    },
  )
}
