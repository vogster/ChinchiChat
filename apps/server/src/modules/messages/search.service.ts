import { has, Permission } from '@chinchi/shared'

import { isMessageChannel } from '../channels/channel.repository'
import { permissionsIn } from '../guilds/guild-access'

import type { ChannelRepository } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { OverwriteRepository } from '../roles/overwrite.repository'
import type { MessageRepository, MessageWithAuthor } from './message.repository'
import type { MessageViews } from './message-views'
import type { Message, SearchHas, SearchResult, Snowflake } from '@chinchi/shared'

export interface SearchServiceDeps {
  readonly messages: Pick<MessageRepository, 'search'>
  readonly views: Pick<MessageViews, 'build'>
  readonly access: Pick<GuildAccessChecks, 'requireMember'>
  readonly channels: Pick<ChannelService, 'resolve'>
  readonly channelRows: Pick<ChannelRepository, 'listByGuild'>
  readonly overwrites: Pick<OverwriteRepository, 'listForChannels'>
}

export interface SearchQuery {
  readonly q?: string | undefined
  readonly authorId?: Snowflake | undefined
  readonly channelId?: Snowflake | undefined
  readonly has?: SearchHas | undefined
  readonly before?: Snowflake | undefined
  readonly limit: number
}

const READ = Permission.ViewChannel | Permission.ReadMessageHistory

/** Message search: a whole server (the channels the searcher may read) or one channel. */
export const createSearchService = ({
  messages,
  views,
  access,
  channels,
  channelRows,
  overwrites,
}: SearchServiceDeps) => {
  /** Rows from several channels, shaped per channel and put back in their order. */
  const shape = async (
    rows: readonly MessageWithAuthor[],
    guildId: Snowflake | null,
    viewerId: Snowflake,
  ): Promise<Message[]> => {
    const byChannel = new Map<Snowflake, MessageWithAuthor[]>()
    for (const row of rows) {
      byChannel.set(row.message.channelId, [...(byChannel.get(row.message.channelId) ?? []), row])
    }
    const built = await Promise.all(
      [...byChannel].map(([channelId, channelRowsOf]) =>
        views.build(channelId, guildId, channelRowsOf, { viewerId }),
      ),
    )
    const byId = new Map(built.flat().map((message) => [message.id, message]))
    return rows.flatMap(({ message }) => byId.get(message.id) ?? [])
  }

  const run = async (
    channelIds: readonly Snowflake[],
    guildId: Snowflake | null,
    viewerId: Snowflake,
    { q, authorId, has: kind, before, limit }: SearchQuery,
  ): Promise<SearchResult> => {
    const { rows, total } = await messages.search({
      channelIds,
      q,
      authorId,
      has: kind,
      before,
      limit,
    })
    return { messages: await shape(rows, guildId, viewerId), total }
  }

  return {
    async searchGuild(guildId: Snowflake, userId: Snowflake, query: SearchQuery) {
      const member = await access.requireMember(guildId, userId)
      const rows = await channelRows.listByGuild(guildId)
      const byChannel = await overwrites.listForChannels(rows.map((row) => row.id))
      // Only channels the searcher could open and scroll back through themselves.
      const readable = rows
        .filter((row) => isMessageChannel(row.type))
        .filter((row) => has(permissionsIn(member, byChannel.get(row.id) ?? []), READ))
        .map((row) => row.id)
      const channelIds = query.channelId
        ? readable.filter((id) => id === query.channelId)
        : readable
      return run(channelIds, guildId, userId, query)
    },

    async searchChannel(channelId: Snowflake, userId: Snowflake, query: SearchQuery) {
      const { channel } = await channels.resolve(channelId, userId, Permission.ReadMessageHistory)
      return run([channel.id], channel.guildId, userId, query)
    },
  }
}

export type SearchService = ReturnType<typeof createSearchService>
