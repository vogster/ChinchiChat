import { Permission, has } from '@chinchi/shared'

import { permissionsIn } from './guild-access'
import { toGuildEmoji } from '../emojis/emoji.service'
import { activeTimeout, toChannel, toGuild, toRole } from './guild.mapper'

import type { ChannelRepository, ChannelRow } from '../channels/channel.repository'
import type { EmojiRepository } from '../emojis/emoji.service'
import type { OverwriteRepository } from '../roles/overwrite.repository'
import type { GuildAccess } from './guild-access'
import type { Channel, GuildDetail, Snowflake } from '@chinchi/shared'

export interface GuildViewDeps {
  readonly channels: ChannelRepository
  readonly overwrites: OverwriteRepository
  /** The server's emoji, part of what a member sees of it. */
  readonly emojis?: Pick<EmojiRepository, 'listByGuild'>
}

/** API shapes of servers and channels, as one member is allowed to see them. */
export const createGuildViews = ({ channels, overwrites, emojis }: GuildViewDeps) => {
  const visibleChannels = async (access: GuildAccess) => {
    const rows = await channels.listByGuild(access.guild.id)
    const byChannel = await overwrites.listForChannels(rows.map((row) => row.id))
    const visible = rows.filter((row) =>
      has(permissionsIn(access, byChannel.get(row.id) ?? []), Permission.ViewChannel),
    )
    return { rows, visible, byChannel }
  }

  return {
    /** Hidden channels (no VIEW_CHANNEL) are left out entirely, names included. */
    async detail(access: GuildAccess): Promise<GuildDetail> {
      const { visible, byChannel } = await visibleChannels(access)
      return {
        ...toGuild(access.guild),
        channels: visible.map((row) => toChannel(row, byChannel.get(row.id))),
        roles: access.roles.map(toRole),
        myRoleIds: [...access.memberRoleIds],
        emojis: emojis ? (await emojis.listByGuild(access.guild.id)).map(toGuildEmoji) : [],
        myTimeoutUntil: activeTimeout(access.member.timeoutUntil),
        myPending: access.context.pending === true,
      }
    },

    async channel(row: ChannelRow): Promise<Channel> {
      return toChannel(row, await overwrites.listForChannel(row.id))
    },

    /** Ids of the server's channels: all that exist, and those this member can see. */
    async channelIds(
      access: GuildAccess,
    ): Promise<{ existing: Set<Snowflake>; visible: Set<Snowflake> }> {
      const { rows, visible } = await visibleChannels(access)
      return {
        existing: new Set(rows.map((r) => r.id)),
        visible: new Set(visible.map((r) => r.id)),
      }
    },
  }
}

export type GuildViews = ReturnType<typeof createGuildViews>
