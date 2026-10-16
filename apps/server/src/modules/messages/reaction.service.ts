import {
  customEmojiId,
  has,
  Permission,
  REACTION_USERS_PAGE_MAX,
  REACTIONS_PER_MESSAGE_MAX,
} from '@chinchi/shared'

import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { isMessageChannel } from '../channels/channel.repository'
import { cannotMessage } from '../dms/dm.service'

import type { AnyChannelRow } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { ChannelEvents } from '../channels/channel-events'
import type { UserRow } from '../users/user.repository'
import type { MessageRepository } from './message.repository'
import type { ReactionRepository } from './reaction.repository'
import type { Snowflake } from '@chinchi/shared'

export interface ReactionServiceDeps {
  readonly reactions: ReactionRepository
  readonly messages: MessageRepository
  readonly channels: ChannelService
  readonly channelEvents: ChannelEvents
  /**
   * A server emoji's canonical `<:name:id>` if it belongs to that server (only its own can
   * be reactions there), else null.
   */
  readonly serverEmoji?: (guildId: Snowflake, emojiId: Snowflake) => Promise<string | null>
  readonly nextId: () => Snowflake
}

export interface ReactionTarget {
  readonly channelId: Snowflake
  readonly messageId: Snowflake
  readonly emoji: string
}

const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

export const createReactionService = ({
  reactions,
  messages,
  channels,
  channelEvents,
  serverEmoji = async () => null,
  nextId,
}: ReactionServiceDeps) => {
  /** A message in a text channel the user can read (404 otherwise). */
  const locate = async (channelId: Snowflake, messageId: Snowflake, userId: Snowflake) => {
    const access = await channels.resolve(channelId, userId, Permission.ReadMessageHistory)
    if (!isMessageChannel(access.channel.type)) throw unknownMessage()
    if (!(await messages.findInChannel(access.channel.id, messageId))) throw unknownMessage()
    return access
  }

  /** Plain reactions would show the server the emoji: encrypted conversations take only sets. */
  const assertPlain = (channel: AnyChannelRow) => {
    if (channel.encrypted) {
      throw badRequest('ENCRYPTED_CHANNEL', 'This conversation takes only encrypted reactions')
    }
  }

  const publish = (
    type: 'MESSAGE_REACTION_ADD' | 'MESSAGE_REACTION_REMOVE',
    channel: AnyChannelRow,
    target: ReactionTarget,
    userId: Snowflake,
  ) => channelEvents.publish(channel, type, { ...target, guildId: channel.guildId, userId })

  const removeFor = async (target: ReactionTarget, channel: AnyChannelRow, userId: Snowflake) => {
    if (await reactions.remove({ messageId: target.messageId, userId, emoji: target.emoji })) {
      await publish('MESSAGE_REACTION_REMOVE', channel, target, userId)
    }
  }

  return {
    /** A new emoji needs ADD_REACTIONS; joining an existing one does not (as in Discord). */
    async add(target: ReactionTarget, userId: Snowflake): Promise<void> {
      const { channel, permissions } = await locate(target.channelId, target.messageId, userId)
      assertPlain(channel)
      // Across a block in a 1:1 DM, not even joining an existing reaction gets through.
      if (channel.type === 'dm' && !has(permissions, Permission.SendMessages)) {
        throw cannotMessage()
      }
      // A server emoji is stored under its real name: one reaction per picture, no spoofed labels.
      const emojiId = customEmojiId(target.emoji)
      const emoji =
        emojiId === null
          ? target.emoji
          : channel.guildId === null
            ? null
            : await serverEmoji(channel.guildId, emojiId)
      if (emoji === null) {
        throw badRequest('UNKNOWN_EMOJI', "Only this server's own emoji can be reactions here")
      }
      const result = await reactions.addChecked(
        { messageId: target.messageId, userId, emoji },
        {
          canAddNew: has(permissions, Permission.AddReactions),
          maxDistinct: REACTIONS_PER_MESSAGE_MAX,
        },
      )
      if (result === 'forbidden') {
        throw forbidden('MISSING_PERMISSIONS', "You can't add new reactions here")
      }
      if (result === 'full') {
        throw badRequest('TOO_MANY_REACTIONS', 'This message has too many different reactions')
      }
      if (result === 'added') {
        await publish('MESSAGE_REACTION_ADD', channel, { ...target, emoji }, userId)
      }
    },

    async removeOwn(target: ReactionTarget, userId: Snowflake): Promise<void> {
      const { channel } = await locate(target.channelId, target.messageId, userId)
      await removeFor(target, channel, userId)
    },

    /**
     * My whole set of reactions to a message of an encrypted conversation, encrypted on my device
     * (null takes them all back). The server learns that I reacted, not with what.
     */
    async setEncrypted(
      channelId: Snowflake,
      messageId: Snowflake,
      userId: Snowflake,
      ciphertext: string | null,
    ): Promise<void> {
      const { channel, permissions } = await locate(channelId, messageId, userId)
      if (!channel.encrypted)
        throw badRequest('NOT_ENCRYPTED', 'This conversation is not encrypted')
      if (!has(permissions, Permission.SendMessages)) throw cannotMessage()
      const reaction = ciphertext ? { version: nextId(), ciphertext } : null
      if (reaction) await reactions.setEncrypted({ messageId, userId, ...reaction })
      else if (!(await reactions.removeEncrypted(messageId, userId))) return
      await channelEvents.publish(channel, 'E2EE_REACTION_UPDATE', {
        channelId: channel.id,
        guildId: channel.guildId,
        messageId,
        userId,
        reaction,
      })
    },

    /** Someone else's reaction: moderators only. */
    async removeOf(target: ReactionTarget, userId: Snowflake, targetUserId: Snowflake) {
      const { channel, permissions } = await locate(target.channelId, target.messageId, userId)
      if (!has(permissions, Permission.ManageMessages)) {
        throw forbidden('MISSING_PERMISSIONS', "You can't remove reactions of others")
      }
      await removeFor(target, channel, targetUserId)
    },

    async users(target: ReactionTarget, userId: Snowflake): Promise<UserRow[]> {
      await locate(target.channelId, target.messageId, userId)
      return reactions.listUsers(target.messageId, target.emoji, REACTION_USERS_PAGE_MAX)
    },
  }
}

export type ReactionService = ReturnType<typeof createReactionService>
