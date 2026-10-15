import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { guildQueryOptions } from '../guilds/queries'
import { useGuildPermissions } from '../permissions/use-guild-permissions'

import type { Snowflake } from '@chinchi/shared'

/** Whether the viewer ranks above a member (the owner above all, nobody above the owner). */
export const useOutranks = (guildId: Snowflake | null) => {
  const { data: guild } = useQuery({
    ...guildQueryOptions(useApi(), guildId ?? ''),
    enabled: guildId !== null,
  })
  const permissions = useGuildPermissions(guild)
  const top = (roleIds: readonly string[]) =>
    Math.max(
      0,
      ...(guild?.roles ?? []).filter((r) => roleIds.includes(r.id)).map((r) => r.position),
    )
  return {
    guild,
    permissions,
    outranks: (userId: Snowflake, roleIds: readonly string[]) =>
      guild !== undefined &&
      (permissions.isOwner || (userId !== guild.ownerId && top(guild.myRoleIds) > top(roleIds))),
  }
}
