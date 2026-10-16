import fp from 'fastify-plugin'

import { forbidden, unauthorized } from '../../http/http-error'
import { assertTrustedOrigin, isSafeMethod } from './csrf'

import type { AuthContext, AuthService } from './auth.service'
import type { FastifyRequest } from 'fastify'

export const SESSION_COOKIE = 'chinchi_session'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
    authMethod: 'cookie' | 'bearer' | null
  }
  interface FastifyInstance {
    /** The instance setting behind `requireVerifiedHuman`. */
    requireVerifiedEmail: () => Promise<boolean>
  }
}

export interface AuthPluginOptions {
  readonly authService: AuthService
  readonly webOrigins: readonly string[]
  /** Whether reaching other people needs a confirmed email (an admin setting). */
  readonly requireVerifiedEmail?: () => Promise<boolean>
}

interface Credentials {
  readonly method: 'cookie' | 'bearer'
  readonly token: string
}

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+)$/

const extractCredentials = (request: FastifyRequest): Credentials | null => {
  const header = request.headers.authorization
  if (header !== undefined) {
    const match = BEARER_PATTERN.exec(header)
    return match ? { method: 'bearer', token: match[1] as string } : null
  }
  const cookie = request.cookies[SESSION_COOKIE]
  return cookie ? { method: 'cookie', token: cookie } : null
}

/** Resolves the session for every request and enforces CSRF rules on writes. */
export const authPlugin = fp<AuthPluginOptions>(
  async (app, { authService, webOrigins, requireVerifiedEmail = async () => false }) => {
    app.decorateRequest('auth', null)
    app.decorateRequest('authMethod', null)
    app.decorate('requireVerifiedEmail', requireVerifiedEmail)

    app.addHook('onRequest', async (request) => {
      const credentials = extractCredentials(request)

      if (!isSafeMethod(request.method) && credentials?.method !== 'bearer') {
        assertTrustedOrigin(request, webOrigins, credentials?.method === 'cookie')
      }

      if (credentials) {
        const auth = await authService.authenticate(credentials.token)
        request.auth = auth
        request.authMethod = auth ? credentials.method : null
      }
    })
  },
  { name: 'auth', dependencies: ['@fastify/cookie'] },
)

export const requireAuth = (request: FastifyRequest): AuthContext => {
  if (!request.auth) throw unauthorized()
  return request.auth
}

/** A signed-in person: bots can't create servers, accept invites, befriend, DM or log in. */
export const requireHuman = (request: FastifyRequest): AuthContext => {
  const auth = requireAuth(request)
  if (auth.user.isBot) throw forbidden('BOT_FORBIDDEN', "Bots can't do this")
  return auth
}

/**
 * A person reaching other people (a server, an invite, a DM, a friend request): where the
 * instance asks for it, their email must be confirmed, so a throwaway sign-up stops here.
 */
export const requireVerifiedHuman = async (request: FastifyRequest): Promise<AuthContext> => {
  const auth = requireHuman(request)
  if (!auth.user.emailVerifiedAt && (await request.server.requireVerifiedEmail())) {
    throw forbidden('EMAIL_NOT_VERIFIED', 'Confirm your email address first')
  }
  return auth
}
