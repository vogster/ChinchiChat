import { botSchema, webhookSchema } from '@chinchi/shared'
import { z } from 'zod'

import { id } from './url'

import type { Http } from './http'
import type { Snowflake, UpdateBotRequest } from '@chinchi/shared'

/** Integrations: bots and incoming webhooks. */
export const createBotsApi = (request: Http) => ({
  bots: {
    list: () =>
      request({ method: 'GET', path: '/bots', data: z.object({ bots: z.array(botSchema) }) }),
    /** The returned `token` signs the bot in (Bearer) and is shown only now. */
    create: (username: string) =>
      request({
        method: 'POST',
        path: '/bots',
        body: { username },
        data: z.object({ bot: botSchema, token: z.string() }),
      }),
    update: (botId: Snowflake, body: UpdateBotRequest) =>
      request({
        method: 'PATCH',
        path: `/bots/${id(botId)}`,
        body,
        data: z.object({ bot: botSchema }),
      }),
    /** A new token; the old one stops working. */
    renewToken: (botId: Snowflake) =>
      request({
        method: 'POST',
        path: `/bots/${id(botId)}/token`,
        data: z.object({ token: z.string() }),
      }),
    delete: (botId: Snowflake) => request({ method: 'DELETE', path: `/bots/${id(botId)}` }),
    addToGuild: (guildId: Snowflake, botId: Snowflake) =>
      request({ method: 'POST', path: `/guilds/${id(guildId)}/bots`, body: { botId } }),
  },
  webhooks: {
    list: (channelId: Snowflake) =>
      request({
        method: 'GET',
        path: `/channels/${id(channelId)}/webhooks`,
        data: z.object({ webhooks: z.array(webhookSchema) }),
      }),
    /** The returned `url` holds the secret and is shown only now. */
    create: (channelId: Snowflake, name: string) =>
      request({
        method: 'POST',
        path: `/channels/${id(channelId)}/webhooks`,
        body: { name },
        data: z.object({ webhook: webhookSchema, url: z.string() }),
      }),
    delete: (webhookId: Snowflake) =>
      request({ method: 'DELETE', path: `/webhooks/${id(webhookId)}` }),
  },
})
