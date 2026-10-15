import { HttpError } from '../http/http-error'
import { toChannel, toRole } from '../modules/guilds/guild.mapper'

import type { ChannelRepository } from '../modules/channels/channel.repository'
import type { GuildAccessChecks } from '../modules/guilds/guild-access'
import type { OverwriteRepository } from '../modules/roles/overwrite.repository'
import type { GuildPermissionState } from './visibility'

export interface GuildStateLoaderDeps {
  readonly access: GuildAccessChecks
  readonly channels: ChannelRepository
  readonly overwrites: OverwriteRepository
}

/**
 * Loads a server's full permission picture for one user: every channel (hidden ones too, so the
 * gateway can reveal them when permissions change), all roles and the user's own roles.
 */
export const createGuildStateLoader =
  ({ access, channels, overwrites }: GuildStateLoaderDeps) =>
  async (guildId: string, userId: string): Promise<GuildPermissionState | null> => {
    let member
    try {
      member = await access.requireMember(guildId, userId)
    } catch (error) {
      if (error instanceof HttpError && error.code === 'UNKNOWN_GUILD') return null
      throw error
    }
    const rows = await channels.listByGuild(guildId)
    const byChannel = await overwrites.listForChannels(rows.map((row) => row.id))
    return {
      guildId,
      ownerId: member.guild.ownerId,
      roles: member.roles.map(toRole),
      memberRoleIds: [...member.memberRoleIds],
      channels: new Map(rows.map((row) => [row.id, toChannel(row, byChannel.get(row.id))])),
    }
  }
