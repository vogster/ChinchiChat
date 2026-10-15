import { commandSchema, messageSchema } from '@chinchi/shared'
import { z } from 'zod'

import type { Http } from './http'
import type { CommandDefinition, InvokeCommandRequest, Snowflake } from '@chinchi/shared'

const id = (value: string) => encodeURIComponent(value)
const commandList = z.object({ commands: z.array(commandSchema) })

/** Slash commands: bots register and answer them, people run them. */
export const createCommandsApi = (request: Http) => ({
  commands: {
    /** As a bot: replaces the bot's whole command list. */
    put: (commands: readonly CommandDefinition[]) =>
      request({ method: 'PUT', path: '/bots/@me/commands', body: commands, data: commandList }),
    /** Commands of the bots on this server. */
    guild: (guildId: Snowflake) =>
      request({ method: 'GET', path: `/guilds/${id(guildId)}/commands`, data: commandList }),
  },
  interactions: {
    /** Runs a command in a channel; the bot gets `INTERACTION_CREATE`. */
    invoke: (channelId: Snowflake, body: InvokeCommandRequest) =>
      request({ method: 'POST', path: `/channels/${id(channelId)}/interactions`, body }),
    /** As a bot: answers an interaction once, with its id and token from the gateway. */
    respond: (interactionId: Snowflake, token: string, content: string) =>
      request({
        method: 'POST',
        path: `/interactions/${id(interactionId)}/${id(token)}/callback`,
        body: { content },
        data: z.object({ message: messageSchema }),
      }),
  },
})
