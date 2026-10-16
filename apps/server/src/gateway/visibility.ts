import { Permission, computeChannelPermissions, has, parsePermissions } from '@chinchi/shared'

import type { Channel, DispatchType, Guild, Role } from '@chinchi/shared'

/**
 * What one connection knows about a server to decide what its user may see: every channel
 * (hidden ones included, so they can be revealed later), the roles and the user's own roles.
 */
export interface GuildPermissionState {
  readonly guildId: string
  readonly ownerId: string
  readonly roles: readonly Role[]
  readonly memberRoleIds: readonly string[]
  readonly channels: ReadonlyMap<string, Channel>
}

export interface Output {
  readonly type: DispatchType
  readonly data: unknown
}

export interface Applied {
  readonly state: GuildPermissionState
  readonly outputs: readonly Output[]
}

const canView = (state: GuildPermissionState, userId: string, channel: Channel): boolean =>
  has(
    computeChannelPermissions(
      {
        guildId: state.guildId,
        ownerId: state.ownerId,
        userId,
        memberRoleIds: state.memberRoleIds,
        roles: state.roles.map((r) => ({
          id: r.id,
          position: r.position,
          permissions: parsePermissions(r.permissions),
        })),
      },
      channel.permissionOverwrites.map((o) => ({
        targetType: o.targetType,
        targetId: o.targetId,
        allow: parsePermissions(o.allow),
        deny: parsePermissions(o.deny),
      })),
    ),
    Permission.ViewChannel,
  )

export const visibleChannelIds = (state: GuildPermissionState, userId: string): Set<string> =>
  new Set([...state.channels.values()].filter((c) => canView(state, userId, c)).map((c) => c.id))

/** Channel creates/deletes the user should see after their permissions changed. */
const visibilityDiff = (
  before: GuildPermissionState,
  after: GuildPermissionState,
  userId: string,
): Output[] => {
  const was = visibleChannelIds(before, userId)
  const now = visibleChannelIds(after, userId)
  return [
    ...[...was]
      .filter((id) => !now.has(id))
      .map((id) => ({ type: 'CHANNEL_DELETE' as const, data: { id, guildId: after.guildId } })),
    ...[...now]
      .filter((id) => !was.has(id))
      .map((id) => ({ type: 'CHANNEL_CREATE' as const, data: after.channels.get(id) })),
  ]
}

/** Applies a permission-affecting change, forwarding the event and any visibility changes. */
const withDiff = (
  state: GuildPermissionState,
  next: GuildPermissionState,
  userId: string,
  event: Output,
): Applied => ({
  state: next,
  outputs: [event, ...visibilityDiff(state, next, userId)],
})

const replaceRole = (roles: readonly Role[], role: Role) =>
  roles.some((r) => r.id === role.id)
    ? roles.map((r) => (r.id === role.id ? role : r))
    : [...roles, role]

/**
 * Turns one server event into what this user is allowed to receive, keeping the permission
 * state current. Pure: the connection owns the state and sends the outputs.
 */
export const applyGuildEvent = (
  state: GuildPermissionState,
  userId: string,
  type: DispatchType,
  data: unknown,
): Applied => {
  const forward = (outputs: Output[] = [{ type, data }]): Applied => ({ state, outputs })

  switch (type) {
    case 'MESSAGE_CREATE':
    case 'MESSAGE_UPDATE':
    case 'MESSAGE_DELETE':
    case 'MESSAGE_REACTION_ADD':
    case 'MESSAGE_REACTION_REMOVE':
    case 'E2EE_REACTION_UPDATE':
    case 'TYPING_START': {
      const channel = state.channels.get((data as { channelId: string }).channelId)
      return forward(channel && canView(state, userId, channel) ? undefined : [])
    }

    case 'VOICE_STATE_UPDATE': {
      // Who sits in a hidden channel stays hidden: to this user they simply left voice.
      const voiceState = data as { channelId: string | null }
      const channel = voiceState.channelId ? state.channels.get(voiceState.channelId) : undefined
      if (voiceState.channelId === null || (channel && canView(state, userId, channel))) {
        return forward()
      }
      return forward([{ type, data: { ...voiceState, channelId: null } }])
    }

    case 'CHANNEL_CREATE':
    case 'CHANNEL_UPDATE': {
      const channel = data as Channel
      const previous = state.channels.get(channel.id)
      const next = { ...state, channels: new Map(state.channels).set(channel.id, channel) }
      const wasVisible = previous !== undefined && canView(state, userId, previous)
      const isVisible = canView(next, userId, channel)
      const outputs: Output[] = isVisible
        ? [{ type: wasVisible ? 'CHANNEL_UPDATE' : 'CHANNEL_CREATE', data: channel }]
        : wasVisible
          ? [{ type: 'CHANNEL_DELETE', data: { id: channel.id, guildId: state.guildId } }]
          : []
      return { state: next, outputs }
    }

    case 'CHANNEL_DELETE': {
      const { id } = data as { id: string }
      const previous = state.channels.get(id)
      const channels = new Map(state.channels)
      channels.delete(id)
      return {
        state: { ...state, channels },
        outputs: previous && canView(state, userId, previous) ? [{ type, data }] : [],
      }
    }

    case 'GUILD_ROLE_CREATE':
    case 'GUILD_ROLE_UPDATE': {
      const { role } = data as { role: Role }
      return withDiff(state, { ...state, roles: replaceRole(state.roles, role) }, userId, {
        type,
        data,
      })
    }

    case 'GUILD_ROLE_DELETE': {
      const { roleId } = data as { roleId: string }
      const next = {
        ...state,
        roles: state.roles.filter((r) => r.id !== roleId),
        memberRoleIds: state.memberRoleIds.filter((id) => id !== roleId),
      }
      return withDiff(state, next, userId, { type, data })
    }

    case 'GUILD_MEMBER_UPDATE': {
      const update = data as { userId: string; roleIds: string[] }
      if (update.userId !== userId) return forward()
      return withDiff(state, { ...state, memberRoleIds: update.roleIds }, userId, { type, data })
    }

    case 'GUILD_UPDATE': {
      const guild = data as Guild
      return withDiff(state, { ...state, ownerId: guild.ownerId }, userId, { type, data })
    }

    default:
      return forward()
  }
}
