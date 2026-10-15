import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useApi } from '../../lib/api-context'
import { membersQueryOptions } from '../guilds/queries'
import { memberColor, toHexColor } from './permissions'

import type { GuildDetail } from '@chinchi/shared'

/** CSS color of each member's name (their highest colored role), or undefined for the default. */
export const useMemberColors = (guild: GuildDetail): ((userId: string) => string | undefined) => {
  const { data: members } = useQuery(membersQueryOptions(useApi(), guild.id))
  return useMemo(() => {
    const colors = new Map(
      (members ?? []).map((m) => [m.user.id, memberColor(guild.roles, m.roleIds)] as const),
    )
    return (userId: string) => {
      const color = colors.get(userId)
      return color ? toHexColor(color) : undefined
    }
  }, [members, guild.roles])
}
