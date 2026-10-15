import { Permission } from '@chinchi/shared'

import { uniqueViolationConstraint } from '../../db/errors'
import { guildTopic } from '../../events/event-bus'
import { HttpError, badRequest, conflict } from '../../http/http-error'
import { createOverwriteRepository } from '../roles/overwrite.repository'
import { createChannelRepository, lockChannel } from './channel.repository'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { GuildViews } from '../guilds/guild-views'
import type { MessageRepository } from '../messages/message.repository'
import type { ChannelRepository, ChannelRow } from './channel.repository'
import type { ChannelService } from './channel.service'
import type { Channel, CreateThreadRequest, Snowflake } from '@chinchi/shared'

/** Threads per channel: enough for any real conversation, not enough to flood the server. */
export const MAX_THREADS_PER_CHANNEL = 500

export interface ThreadServiceDeps {
  readonly db: Database
  readonly channels: Pick<ChannelService, 'resolveGuild'>
  readonly channelRows: Pick<ChannelRepository, 'bumpMessageCount' | 'clearThreadStarters'>
  readonly messages: Pick<MessageRepository, 'findInChannel'>
  readonly views: Pick<GuildViews, 'channel'>
  readonly events: EventBus
  readonly nextId: () => Snowflake
}

const threadExists = () => conflict('THREAD_EXISTS', 'This message already has a thread')

/** Threads: channels inside a text channel, optionally started from one of its messages. */
export const createThreadService = ({
  db,
  channels,
  channelRows,
  messages,
  views,
  events,
  nextId,
}: ThreadServiceDeps) => {
  const publish = async (type: 'CHANNEL_CREATE' | 'CHANNEL_UPDATE', thread: ChannelRow) =>
    events.publish({ topic: guildTopic(thread.guildId), type, data: await views.channel(thread) })

  return {
    async create(
      userId: Snowflake,
      parentId: Snowflake,
      { name, messageId }: CreateThreadRequest,
    ): Promise<Channel> {
      // Answering a message means having read it.
      const needed = messageId
        ? Permission.SendMessages | Permission.ReadMessageHistory
        : Permission.SendMessages
      const { channel: parent } = await channels.resolveGuild(parentId, userId, needed)
      if (parent.type !== 'text') {
        throw badRequest('INVALID_CHANNEL', 'Threads live in text channels')
      }
      if (messageId && !(await messages.findInChannel(parent.id, messageId))) {
        throw new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')
      }
      let created: ChannelRow
      try {
        // Under the parent's row lock: permission syncs and the thread cap see a stable list.
        created = await db.transaction(async (tx) => {
          const current = await lockChannel(tx, parent.id)
          if (!current) throw new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')
          const txChannels = createChannelRepository(tx)
          if ((await txChannels.listThreads(parent.id)).length >= MAX_THREADS_PER_CHANNEL) {
            throw badRequest('TOO_MANY_THREADS', 'This channel has as many threads as allowed')
          }
          const [row] = await txChannels.insertMany([
            {
              id: nextId(),
              guildId: parent.guildId,
              type: 'thread',
              name,
              parentId: parent.id,
              position: 0,
              topic: null,
              threadStarterId: messageId ?? null,
              ownerId: userId,
              // A thread follows its channel's pace and age restriction.
              rateLimitPerUser: current.rateLimitPerUser,
              nsfw: current.nsfw,
            },
          ])
          const txOverwrites = createOverwriteRepository(tx)
          await txOverwrites.replaceForChannel(
            (row as ChannelRow).id,
            await txOverwrites.listForChannel(parent.id),
          )
          return row as ChannelRow
        })
      } catch (error) {
        // Two people starting a thread on the same message at once.
        if (uniqueViolationConstraint(error)) throw threadExists()
        throw error
      }
      await publish('CHANNEL_CREATE', created)
      return views.channel(created)
    },

    /**
     * Keeps a thread's message count current. Not announced: clients count the
     * MESSAGE_CREATE / MESSAGE_DELETE events of the thread they already receive.
     */
    async countMessages(channelId: Snowflake, delta: number): Promise<void> {
      if (delta !== 0) await channelRows.bumpMessageCount(channelId, delta)
    },

    /** Deleted messages no longer anchor the threads started from them. */
    async forgetStarters(messageIds: readonly Snowflake[]): Promise<void> {
      for (const thread of await channelRows.clearThreadStarters(messageIds)) {
        await publish('CHANNEL_UPDATE', thread)
      }
    },
  }
}

export type ThreadService = ReturnType<typeof createThreadService>
