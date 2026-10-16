import { Permission } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { HttpError, badRequest, forbidden } from '../../http/http-error'
import { isGuildChannel } from '../channels/channel.repository'
import { outranks } from '../guilds/outranks'

import type { EventBus } from '../../events/event-bus'
import type { ChannelRepository, ChannelRow } from '../channels/channel.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { VoiceStateStore } from './voice-state.store'
import type { Snowflake } from '@chinchi/shared'

export interface VoiceMoveDeps {
  readonly store: () => VoiceStateStore
  readonly channelRows: Pick<ChannelRepository, 'findById'>
  readonly access: GuildAccessChecks
  readonly events: EventBus
}

const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')

/**
 * Moves someone to another voice channel of the server. Their client does the switch (a join
 * ends the old connection), so the move only happens where they could join themselves.
 */
export const createVoiceMove = ({ store, channelRows, access, events }: VoiceMoveDeps) => {
  /** A voice channel of this server, or the error the actor may see. */
  const findGuildChannel = async (guildId: Snowflake, channelId: Snowflake) => {
    const found = await channelRows.findById(channelId)
    if (!found || !isGuildChannel(found) || found.guildId !== guildId) throw unknownChannel()
    return found
  }

  /** MOVE_MEMBERS where the target sits; a channel hidden from the actor is a missing right. */
  const requireMoveFrom = (channel: ChannelRow, actorId: Snowflake) =>
    access.requireChannel(channel, actorId, Permission.MoveMembers).catch((error: unknown) => {
      if (error instanceof HttpError && error.statusCode === 404) {
        throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
      }
      throw error
    })

  const requireOutranks = async (guildId: Snowflake, actorId: Snowflake, targetId: Snowflake) => {
    if (actorId === targetId) return
    const [actor, target] = await Promise.all([
      access.requireMember(guildId, actorId),
      access.requireMember(guildId, targetId),
    ])
    if (!outranks(actor, target)) {
      throw forbidden('ROLE_HIERARCHY', 'You can only moderate members below your highest role')
    }
  }

  return async (
    actorId: Snowflake,
    guildId: Snowflake,
    targetId: Snowflake,
    channelId: Snowflake,
  ): Promise<void> => {
    const current = await store().get(targetId)
    if (current?.guildId !== guildId || !current.channelId) {
      throw badRequest('NOT_IN_VOICE', 'The member is not connected to voice here')
    }
    await requireMoveFrom(await findGuildChannel(guildId, current.channelId), actorId)
    const destination = await findGuildChannel(guildId, channelId)
    await access.requireChannel(destination, actorId, Permission.Connect)
    if (destination.type !== 'voice') {
      throw badRequest('INVALID_CHANNEL', 'Only voice channels can be joined')
    }
    await requireOutranks(guildId, actorId, targetId)
    await access.requireChannel(destination, targetId, Permission.Connect).catch(() => {
      throw forbidden('CANNOT_CONNECT', 'The member may not join this channel')
    })
    if (destination.id === current.channelId) return
    await events.publish({
      topic: userTopic(targetId),
      type: 'VOICE_MOVE',
      data: { guildId, channelId: destination.id },
    })
  }
}
