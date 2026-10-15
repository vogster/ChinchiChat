import { PINS_PER_CHANNEL_MAX, Permission, has } from '@chinchi/shared'

import { isMessageChannel } from '../channels/channel.repository'
import { HttpError, badRequest, forbidden } from '../../http/http-error'

import type { ChannelEvents } from '../channels/channel-events'
import type { ChannelService } from '../channels/channel.service'
import type { MessageViews } from './message-views'
import type { MessageRepository } from './message.repository'
import type { Message, Snowflake } from '@chinchi/shared'

export interface PinServiceDeps {
  readonly messages: MessageRepository
  readonly channels: ChannelService
  readonly views: MessageViews
  readonly channelEvents: ChannelEvents
  readonly now?: () => Date
}

const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

/** Pinned messages: moderators pin and unpin, everyone who can read the channel sees them. */
export const createPinService = ({
  messages,
  channels,
  views,
  channelEvents,
  now = () => new Date(),
}: PinServiceDeps) => {
  const textChannel = async (channelId: Snowflake, userId: Snowflake, flag: bigint) => {
    const access = await channels.resolve(channelId, userId, flag)
    if (!isMessageChannel(access.channel.type)) throw unknownMessage()
    return access
  }

  const setPinned = async (
    channelId: Snowflake,
    messageId: Snowflake,
    userId: Snowflake,
    pinned: boolean,
  ) => {
    const { channel, permissions } = await textChannel(
      channelId,
      userId,
      Permission.ReadMessageHistory,
    )
    if (!has(permissions, Permission.ManageMessages)) {
      throw forbidden('MISSING_PERMISSIONS', "You can't pin messages here")
    }
    const found = await messages.findInChannel(channel.id, messageId)
    if (!found) throw unknownMessage()
    const result = pinned
      ? await messages.pinChecked(channel.id, messageId, now(), PINS_PER_CHANNEL_MAX)
      : ((await messages.setPinned(messageId, null)) ?? 'unchanged')
    if (result === 'full') {
      throw badRequest('TOO_MANY_PINS', 'This channel has too many pinned messages')
    }
    // Already in that state: nothing to tell anyone.
    if (result === 'unchanged') return
    const row = result
    await channelEvents.publish(
      channel,
      'MESSAGE_UPDATE',
      await views.one(channel.id, channel.guildId, { message: row, author: found.author }),
    )
  }

  return {
    pin: (channelId: Snowflake, messageId: Snowflake, userId: Snowflake) =>
      setPinned(channelId, messageId, userId, true),

    unpin: (channelId: Snowflake, messageId: Snowflake, userId: Snowflake) =>
      setPinned(channelId, messageId, userId, false),

    async list(channelId: Snowflake, userId: Snowflake): Promise<Message[]> {
      const { channel } = await textChannel(channelId, userId, Permission.ReadMessageHistory)
      const rows = await messages.listPinned(channel.id)
      return views.build(channel.id, channel.guildId, rows, { viewerId: userId })
    },
  }
}

export type PinService = ReturnType<typeof createPinService>
