import { useEffect, useMemo, useState } from 'react'

import { useCurrentUser } from '../auth/use-auth-actions'
import {
  basePermissions,
  canManageGuildRole,
  channelPermissions,
  grantablePermissions,
} from './permissions'

import type { Channel, GuildDetail, Role } from '@chinchi/shared'

export interface GuildPermissions {
  readonly isOwner: boolean
  /** Server-wide permissions. */
  readonly base: bigint
  readonly inChannel: (channel: Channel) => bigint
  /** What the user may grant to roles and channel overwrites. */
  readonly grantable: bigint
  readonly canManageRole: (role: Role) => boolean
  /** When the user's running timeout ends, or null without one. */
  readonly timeoutUntil: string | null
}

const NONE: GuildPermissions = {
  isOwner: false,
  base: 0n,
  inChannel: () => 0n,
  grantable: 0n,
  canManageRole: () => false,
  timeoutUntil: null,
}

// setTimeout overflows past ~24.8 days; longer timeouts just re-arm.
const MAX_DELAY = 2 ** 31 - 1

/** Re-renders when a timeout runs out, so permissions come back without a reload. */
const useTimeoutEnd = (until: string | null): string | null => {
  const [now, setNow] = useState(() => Date.now())
  const end = until === null ? 0 : Date.parse(until)
  useEffect(() => {
    if (end <= now) return
    const left = Math.max(end - Date.now(), 0)
    const timer = setTimeout(() => setNow(Date.now()), Math.min(left + 50, MAX_DELAY))
    return () => clearTimeout(timer)
  }, [end, now])
  return end > now ? until : null
}

/** What the signed-in user may do in a server; recomputed when roles or overwrites change. */
export const useGuildPermissions = (guild: GuildDetail | undefined): GuildPermissions => {
  const me = useCurrentUser()
  const timeoutUntil = useTimeoutEnd(guild?.myTimeoutUntil ?? null)
  return useMemo(() => {
    if (!guild || !me) return NONE
    return {
      isOwner: guild.ownerId === me.id,
      base: basePermissions(guild, me.id),
      inChannel: (channel) => channelPermissions(guild, channel, me.id),
      grantable: grantablePermissions(guild, me.id),
      canManageRole: (role) => canManageGuildRole(guild, me.id, role),
      timeoutUntil,
    }
  }, [guild, me, timeoutUntil])
}
