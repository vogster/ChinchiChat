import { Permission } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'

import type { MessageContext, ResolvedMessageDeps } from './message-context'
import type { Snowflake } from '@chinchi/shared'

/** Reading a channel: marking it read (one or a whole server) and typing indicators. */
export const createMessageReading = (
  { readStates, events, channelEvents, visibleChannels, now }: ResolvedMessageDeps,
  { textChannel, findIn }: MessageContext,
) => ({
  /** Marks the channel read up to `messageId` and syncs the user's other devices. */
  async ack(channelId: Snowflake, messageId: Snowflake, userId: Snowflake): Promise<void> {
    const { channel, access } = await textChannel(channelId, userId)
    await findIn(channel.id, messageId)
    const lastReadMessageId = await readStates.advance(userId, channel.id, messageId)
    // In DMs every unread message counts, like a mention.
    const counts = access
      ? await readStates.mentionCounts(userId, [channel.id], access.memberRoleIds)
      : await readStates.unreadCounts(userId, [channel.id])
    await events.publish({
      topic: userTopic(userId),
      type: 'CHANNEL_ACK',
      data: { channelId: channel.id, lastReadMessageId, mentionCount: counts[channel.id] ?? 0 },
    })
  },

  /** Marks every channel of a server the user can see read up to its newest message. */
  async ackGuild(guildId: Snowflake, userId: Snowflake): Promise<void> {
    if (!visibleChannels) return
    const unread = (await visibleChannels(guildId, userId)).filter(
      (channel) =>
        (channel.type === 'text' || channel.type === 'thread') && channel.lastMessageId !== null,
    )
    for (const channel of unread) {
      const lastReadMessageId = await readStates.advance(
        userId,
        channel.id,
        channel.lastMessageId as Snowflake,
      )
      await events.publish({
        topic: userTopic(userId),
        type: 'CHANNEL_ACK',
        data: { channelId: channel.id, lastReadMessageId, mentionCount: 0 },
      })
    }
  },

  listReadStates: (userId: Snowflake) => readStates.listForUser(userId),

  async typing(channelId: Snowflake, userId: Snowflake): Promise<void> {
    const { channel } = await textChannel(channelId, userId, Permission.SendMessages)
    await channelEvents.publish(channel, 'TYPING_START', {
      channelId: channel.id,
      guildId: channel.guildId,
      userId,
      timestamp: now().toISOString(),
    })
  },
})
