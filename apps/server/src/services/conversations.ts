import { customEmojiText } from '@chinchi/shared'

import { createPinService } from '../modules/messages/pin.service'
import { createPollService } from '../modules/messages/poll.service'
import { createReactionService } from '../modules/messages/reaction.service'
import { createSearchService } from '../modules/messages/search.service'
import { createReportRepository } from '../modules/reports/report.repository'
import { createReportService } from '../modules/reports/report.service'

import type { Database } from '../db/client'
import type { ChannelRepository } from '../modules/channels/channel.repository'
import type { ChannelService } from '../modules/channels/channel.service'
import type { ChannelEvents } from '../modules/channels/channel-events'
import type { EmojiRepository } from '../modules/emojis/emoji.service'
import type { GuildAccessChecks } from '../modules/guilds/guild-access'
import type { MessageRepository } from '../modules/messages/message.repository'
import type { MessageViews } from '../modules/messages/message-views'
import type { PollRepository } from '../modules/messages/poll.repository'
import type { ReactionRepository } from '../modules/messages/reaction.repository'
import type { OverwriteRepository } from '../modules/roles/overwrite.repository'
import type { Snowflake } from '@chinchi/shared'

export interface ConversationServiceDeps {
  readonly db: Database
  readonly nextId: () => Snowflake
  readonly access: GuildAccessChecks
  readonly overwrites: OverwriteRepository
  readonly channels: ChannelService
  readonly channelRows: ChannelRepository
  readonly channelEvents: ChannelEvents
  readonly messages: MessageRepository
  readonly views: MessageViews
  readonly reactions: ReactionRepository
  readonly polls: PollRepository
  readonly emojis: EmojiRepository
}

/** What people do around messages: pin, vote, react, search and report them. */
export const createConversationServices = ({
  db,
  nextId,
  access,
  overwrites,
  channels,
  channelRows,
  channelEvents,
  messages,
  views,
  reactions,
  polls,
  emojis,
}: ConversationServiceDeps) => ({
  pin: createPinService({ messages, channels, views, channelEvents }),
  poll: createPollService({ polls, messages, channels, channelEvents }),
  reaction: createReactionService({
    nextId,
    reactions,
    messages,
    channels,
    channelEvents,
    // Server emoji only where they belong, under their real name.
    serverEmoji: async (guildId, emojiId) => {
      const found = await emojis.find(emojiId)
      return found?.guildId === guildId ? customEmojiText(found) : null
    },
  }),
  search: createSearchService({ messages, views, access, channels, channelRows, overwrites }),
  reports: createReportService({
    reports: createReportRepository(db),
    channels,
    channelRows,
    overwrites,
    messages,
    access,
    nextId,
  }),
})
