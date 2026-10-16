import { timingSafeEqual } from 'node:crypto'
import { Permission } from '@chinchi/shared'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'

import { botCommands, guildMembers, interactions, users } from '../../db/schema'
import { userTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { generateSessionToken, hashSessionToken } from '../auth/session-token'
import { isMessageChannel } from '../channels/channel.repository'
import { toPublicUser } from '../users/user.mapper'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { ChannelService } from '../channels/channel.service'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { MessageService } from '../messages/message.service'
import type { UserRow } from '../users/user.repository'
import type { Command, Message, Snowflake } from '@chinchi/shared'

/** How long a bot has to answer a command. */
const INTERACTION_TTL_MS = 15 * 60_000

type CommandRow = typeof botCommands.$inferSelect

export interface CommandServiceDeps {
  readonly db: Database
  readonly access: Pick<GuildAccessChecks, 'requireMember'>
  readonly channels: Pick<ChannelService, 'resolveGuild'>
  readonly messages: Pick<MessageService, 'createAsInteraction' | 'takeSlowmodeTurn'>
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly now?: () => Date
}

const unknownCommand = () => new HttpError(404, 'UNKNOWN_COMMAND', 'Unknown command')
const unknownInteraction = () =>
  new HttpError(404, 'UNKNOWN_INTERACTION', 'Unknown, answered or expired interaction')

const toCommand = (row: CommandRow, bot: UserRow): Command => ({
  id: row.id,
  name: row.name,
  description: row.description,
  options: row.options,
  bot: toPublicUser(bot),
})

/** Slash commands: bots register them, people run them, the bot answers once. */
export const createCommandService = ({
  db,
  access,
  channels,
  messages,
  events,
  nextId,
  now = () => new Date(),
}: CommandServiceDeps) => {
  const ofBots = (botIds: readonly Snowflake[]) =>
    botIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ command: botCommands, bot: users })
          .from(botCommands)
          .innerJoin(users, eq(users.id, botCommands.botId))
          .where(inArray(botCommands.botId, [...botIds]))
          .orderBy(asc(botCommands.name))

  /** The bot's own access to the channel; null when it can't post there. */
  const botAccess = (channelId: Snowflake, botId: Snowflake) =>
    channels.resolveGuild(channelId, botId, Permission.SendMessages).catch((error: unknown) => {
      if (error instanceof HttpError && error.statusCode < 500) return null
      throw error
    })

  return {
    /** A bot's whole command list, replaced at once. */
    async replace(
      bot: UserRow,
      definitions: readonly { name: string; description: string; options: CommandRow['options'] }[],
    ): Promise<Command[]> {
      await db.transaction(async (tx) => {
        await tx.delete(botCommands).where(eq(botCommands.botId, bot.id))
        if (definitions.length > 0) {
          await tx
            .insert(botCommands)
            .values(
              definitions.map((definition) => ({ id: nextId(), botId: bot.id, ...definition })),
            )
        }
      })
      return (await ofBots([bot.id])).map(({ command }) => toCommand(command, bot))
    },

    /** Commands of the bots that are members of this server. */
    async listForGuild(guildId: Snowflake, userId: Snowflake): Promise<Command[]> {
      await access.requireMember(guildId, userId)
      const botIds = (
        await db
          .select({ id: users.id })
          .from(guildMembers)
          .innerJoin(users, eq(users.id, guildMembers.userId))
          .where(and(eq(guildMembers.guildId, guildId), eq(users.isBot, true)))
      ).map((row) => row.id)
      return (await ofBots(botIds)).map(({ command, bot }) => toCommand(command, bot))
    },

    /** Runs a command: needs SEND_MESSAGES in the channel; the bot gets INTERACTION_CREATE. */
    async invoke(
      user: UserRow,
      channelId: Snowflake,
      { commandId, options: given }: { commandId: Snowflake; options: Record<string, string> },
    ): Promise<void> {
      const { channel, permissions } = await channels.resolveGuild(
        channelId,
        user.id,
        Permission.SendMessages,
      )
      if (!isMessageChannel(channel.type)) {
        throw badRequest('NOT_TEXT_CHANNEL', 'Commands run in text channels')
      }
      const [found] = await db
        .select({ command: botCommands, bot: users })
        .from(botCommands)
        .innerJoin(users, eq(users.id, botCommands.botId))
        .innerJoin(
          guildMembers,
          and(
            eq(guildMembers.userId, botCommands.botId),
            eq(guildMembers.guildId, channel.guildId),
          ),
        )
        .where(eq(botCommands.id, commandId))
      if (!found) throw unknownCommand()
      if (!(await botAccess(channel.id, found.bot.id))) {
        throw forbidden('BOT_MISSING_ACCESS', "The bot can't answer in this channel")
      }
      // Blank values count as not given.
      const options = Object.fromEntries(
        Object.entries(given).flatMap(([name, value]) =>
          value.trim() ? [[name, value.trim()]] : [],
        ),
      )
      const known = new Set(found.command.options.map((o) => o.name))
      const missing = found.command.options.some((o) => o.required && !options[o.name])
      if (missing || Object.keys(options).some((name) => !known.has(name))) {
        throw badRequest('INVALID_COMMAND_OPTIONS', 'Missing or unknown command options')
      }
      await messages.takeSlowmodeTurn(channel, user.id, permissions)
      const { token, tokenHash } = generateSessionToken()
      const id = nextId()
      await db.insert(interactions).values({
        id,
        tokenHash,
        botId: found.bot.id,
        commandName: found.command.name,
        guildId: channel.guildId,
        channelId: channel.id,
        userId: user.id,
        expiresAt: new Date(now().getTime() + INTERACTION_TTL_MS),
      })
      await events.publish({
        topic: userTopic(found.bot.id),
        type: 'INTERACTION_CREATE',
        data: {
          id,
          token,
          command: { id: found.command.id, name: found.command.name },
          options,
          channelId: channel.id,
          guildId: channel.guildId,
          user: toPublicUser(user),
        },
      })
    },

    /** The bot's one answer, posted as the bot with a note of who ran the command. */
    async respond(interactionId: Snowflake, token: string, content: string): Promise<Message> {
      const [row] = await db
        .select({
          tokenHash: interactions.tokenHash,
          channelId: interactions.channelId,
          botId: interactions.botId,
        })
        .from(interactions)
        .where(eq(interactions.id, interactionId))
      const given = Buffer.from(hashSessionToken(token))
      const expected = Buffer.from(row?.tokenHash ?? '')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
        throw unknownInteraction()
      }
      // Kicked, muted or shut out since the command ran: the answer is dropped.
      const access = row && (await botAccess(row.channelId, row.botId))
      if (!access) throw unknownInteraction()
      // Claimed atomically: two answers at once can't both go through.
      const [claimed] = await db
        .update(interactions)
        .set({ respondedAt: now() })
        .where(
          and(
            eq(interactions.id, interactionId),
            isNull(interactions.respondedAt),
            gt(interactions.expiresAt, now()),
          ),
        )
        .returning()
      if (!claimed) throw unknownInteraction()
      return messages.createAsInteraction(claimed.channelId, {
        botId: claimed.botId,
        commandName: claimed.commandName,
        userId: claimed.userId,
        content,
        permissions: access.permissions,
      })
    },
  }
}

export type CommandService = ReturnType<typeof createCommandService>
