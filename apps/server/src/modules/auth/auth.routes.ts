import {
  approveQrLoginRequestSchema,
  changePasswordRequestSchema,
  claimQrLoginRequestSchema,
  createQrLoginRequestSchema,
  currentUserSchema,
  loginRequestSchema,
  mfaLoginRequestSchema,
  qrLoginCodeSchema,
  qrLoginIdSchema,
  qrLoginInfoSchema,
  qrLoginTicketSchema,
  registerRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import {
  LOGIN_RATE_LIMIT,
  perUserRateLimit,
  QR_LOGIN_CLAIM_RATE_LIMIT,
  QR_LOGIN_CREATE_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
} from '../../http/rate-limit'
import { ok } from '../../http/responses'
import { toCurrentUser } from '../users/user.mapper'
import { requireAuth, requireHuman, SESSION_COOKIE } from './auth.plugin'

import type { AccountEmailService } from './account-email.service'
import type { AuthResult, AuthService, ClientInfo } from './auth.service'
import type { QrLoginService } from './qr-login.service'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AuthRoutesOptions {
  readonly authService: AuthService
  readonly accountEmails: AccountEmailService
  readonly sessionTtlDays: number
  readonly secureCookies: boolean
  /** Signing in from a signed-in device (QR or short code). */
  readonly qrLogin: QrLoginService
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
  { authService, accountEmails, sessionTtlDays, secureCookies, qrLogin },
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
    extra: Record<string, unknown> = {},
  ) => {
    const payload = { success: true as const, data: { ...extra, user: toCurrentUser(user) } }
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

  const qrParams = z.object({ id: qrLoginIdSchema })
  const infoResponse = ok(z.object({ login: qrLoginInfoSchema }))

  app.post(
    '/auth/qr',
    {
      schema: {
        body: createQrLoginRequestSchema,
        response: { 201: ok(z.object({ ticket: qrLoginTicketSchema })) },
      },
      config: { rateLimit: QR_LOGIN_CREATE_RATE_LIMIT },
    },
    async (request, reply) => {
      const ticket = await qrLogin.create(request.body.publicKey ?? null, clientInfo(request))
      return reply.status(201).send({ success: true as const, data: { ticket } })
    },
  )

  app.get(
    '/auth/qr/:id',
    { schema: { params: qrParams, response: { 200: infoResponse } } },
    async (request) => {
      requireHuman(request)
      return { success: true as const, data: { login: await qrLogin.find(request.params.id) } }
    },
  )

  app.get(
    '/auth/qr/code/:code',
    {
      schema: { params: z.object({ code: qrLoginCodeSchema }), response: { 200: infoResponse } },
      // Codes are short: guessing them is slowed down for each account.
      config: { rateLimit: perUserRateLimit('qr-login-code', 20) },
    },
    async (request) => {
      requireHuman(request)
      return {
        success: true as const,
        data: { login: await qrLogin.findByCode(request.params.code) },
      }
    },
  )

  app.post(
    '/auth/qr/:id/approve',
    {
      schema: { params: qrParams, body: approveQrLoginRequestSchema },
      config: { rateLimit: perUserRateLimit('qr-login-approve', 10) },
    },
    async (request, reply) => {
      const user = requireHuman(request)
      await qrLogin.approve(request.params.id, user.user.id, request.body)
      return reply.status(204).send()
    },
  )

  app.post(
    '/auth/qr/:id/claim',
    {
      schema: { params: qrParams, body: claimQrLoginRequestSchema },
      config: { rateLimit: QR_LOGIN_CLAIM_RATE_LIMIT },
    },
    async (request, reply) => {
      const outcome = await qrLogin.claim(
        request.params.id,
        request.body.secret,
        clientInfo(request),
      )
      if (outcome.state === 'pending') {
        return reply.send({ success: true as const, data: { state: 'pending' as const } })
      }
      if (outcome.state === 'scanned') {
        return reply.send({ success: true as const, data: outcome })
      }
      return sendAuth(request, reply, 200, outcome.result, {
        state: 'approved',
        sealed: outcome.sealed,
        approverKey: outcome.approverKey,
      })
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
