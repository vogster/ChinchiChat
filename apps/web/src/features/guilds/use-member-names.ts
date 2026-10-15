import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { membersQueryOptions } from './queries'

import type { PublicUser, Snowflake } from '@chinchi/shared'

/**
 * How a person is named where they are shown: their server nickname on a server, else their
 * display name, else their username. `guildId: null` (DMs) skips nicknames.
 */
export const useMemberNames = (guildId: Snowflake | null) => {
  const { data: members } = useQuery({
    ...membersQueryOptions(useApi(), guildId ?? ''),
    enabled: guildId !== null,
  })
  const nicknames = new Map(
    (members ?? []).flatMap((m) => (m.nickname ? [[m.user.id, m.nickname] as const] : [])),
  )
  return (user: PublicUser) => nicknames.get(user.id) ?? user.displayName ?? user.username
}
