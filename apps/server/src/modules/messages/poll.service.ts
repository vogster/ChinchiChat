import { has, Permission } from '@chinchi/shared'

import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { isMessageChannel } from '../channels/channel.repository'

import type { AnyChannelRow } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { ChannelEvents } from '../channels/channel-events'
import type { MessageRepository } from './message.repository'
import type { PollRepository } from './poll.repository'
import type { Poll, Snowflake } from '@chinchi/shared'

export interface PollServiceDeps {
  readonly polls: PollRepository
  readonly messages: Pick<MessageRepository, 'findInChannel'>
  readonly channels: ChannelService
  readonly channelEvents: ChannelEvents
  readonly now?: () => Date
}

const unknownPoll = () => new HttpError(404, 'UNKNOWN_POLL', 'Unknown poll')

/** Voting in polls and ending them; everyone sees new counts through the gateway. */
export const createPollService = ({
  polls,
  messages,
  channels,
  channelEvents,
  now = () => new Date(),
}: PollServiceDeps) => {
  /** The poll of a message in a channel the user can read (404 otherwise). */
  const locate = async (channelId: Snowflake, messageId: Snowflake, userId: Snowflake) => {
    const access = await channels.resolve(channelId, userId, Permission.ReadMessageHistory)
    if (!isMessageChannel(access.channel.type)) throw unknownPoll()
    const found = await messages.findInChannel(access.channel.id, messageId)
    const poll = found ? await polls.find(messageId) : null
    if (!found || !poll) throw unknownPoll()
    return { ...access, message: found.message, poll }
  }

  /** The poll as `viewerId` sees it, after telling everyone the new counts. */
  const announce = async (channel: AnyChannelRow, messageId: Snowflake, viewerId: Snowflake) => {
    const [forAll, forViewer] = await Promise.all([
      polls.summaries([messageId], null),
      polls.summaries([messageId], viewerId),
    ])
    await channelEvents.publish(channel, 'POLL_UPDATE', {
      channelId: channel.id,
      guildId: channel.guildId,
      messageId,
      poll: forAll.get(messageId) as Poll,
    })
    return forViewer.get(messageId) as Poll
  }

  return {
    async vote(
      channelId: Snowflake,
      messageId: Snowflake,
      userId: Snowflake,
      answerIds: readonly number[],
    ): Promise<Poll> {
      const { channel, permissions, poll } = await locate(channelId, messageId, userId)
      if (!has(permissions, Permission.SendMessages)) {
        throw forbidden('MISSING_PERMISSIONS', "You can't vote here")
      }
      if (poll.endedAt || poll.expiresAt <= now()) {
        throw badRequest('POLL_ENDED', 'The poll is over')
      }
      if (!poll.multiple && answerIds.length > 1) {
        throw badRequest('POLL_SINGLE_ANSWER', 'This poll takes one answer')
      }
      if (answerIds.some((id) => !poll.answerIds.includes(id))) {
        throw badRequest('UNKNOWN_ANSWER', 'No such answer')
      }
      await polls.vote(messageId, userId, answerIds)
      return announce(channel, messageId, userId)
    },

    /** Its author ends a poll early. */
    async end(channelId: Snowflake, messageId: Snowflake, userId: Snowflake): Promise<Poll> {
      const { channel, message, poll } = await locate(channelId, messageId, userId)
      if (message.authorId !== userId) {
        throw forbidden('MISSING_PERMISSIONS', 'Only the author can end a poll')
      }
      if (!poll.endedAt && poll.expiresAt > now()) await polls.end(messageId)
      return announce(channel, messageId, userId)
    },
  }
}

export type PollService = ReturnType<typeof createPollService>
