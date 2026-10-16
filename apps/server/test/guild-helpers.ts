import { guildMembers } from '../src/db/schema'
import { registerUser, SESSION_COOKIE, WEB_ORIGIN } from './auth-helpers'

import type { Database } from '../src/db/client'
import type { TestUserInput } from './auth-helpers'
import type { FastifyInstance } from 'fastify'

export interface TestActor {
  readonly id: string
  readonly cookie: string
  readonly headers: Record<string, string>
}

/** Registers a user and returns ready-to-use request headers. */
export const signUp = async (
  app: FastifyInstance,
  input: TestUserInput = {},
): Promise<TestActor> => {
  const { response, cookie } = await registerUser(app, input)
  return {
    id: response.json().data.user.id,
    cookie: cookie as string,
    headers: { cookie: `${SESSION_COOKIE}=${cookie}`, origin: WEB_ORIGIN },
  }
}

export const createGuild = async (
  app: FastifyInstance,
  actor: TestActor,
  name = 'Test server',
  locale: 'ru' | 'en' = 'en',
) => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/guilds',
    headers: actor.headers,
    payload: { name, locale },
  })
  return response.json().data.guild as {
    id: string
    name: string
    ownerId: string
    channels: {
      id: string
      type: string
      name: string
      parentId: string | null
      position: number
    }[]
  }
}

/** Joins directly in the database; invite flows have their own tests. */
export const addMember = async (db: Database, guildId: string, userId: string) => {
  await db.insert(guildMembers).values({ guildId, userId })
}
