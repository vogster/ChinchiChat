import { WEB_ORIGIN } from './test-app'

import type { FastifyInstance, LightMyRequestResponse } from 'fastify'

export { WEB_ORIGIN } from './test-app'
export const SESSION_COOKIE = 'chinchi_session'

export const sessionCookieOf = (response: LightMyRequestResponse): string | undefined =>
  response.cookies.find((cookie) => cookie.name === SESSION_COOKIE)?.value

export interface TestUserInput {
  readonly username?: string
  readonly email?: string
  readonly password?: string
}

export const registerUser = async (
  app: FastifyInstance,
  { username = 'alice', email = 'alice@example.com', password = 'password123' }: TestUserInput = {},
) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { username, email, password },
  })
  return { response, cookie: sessionCookieOf(response) }
}
