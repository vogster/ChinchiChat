import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { instanceQueryOptions } from '../auth/queries'
import { membersQueryOptions } from '../guilds/queries'

import type { PublicUser, Snowflake } from '@chinchi/shared'

/** Whether this instance has voice (LiveKit) set up. */
export const useVoiceEnabled = () => useQuery(instanceQueryOptions(useApi())).data?.voice ?? false

/** Looks up people in a server's voice channels: name as the server shows it, and avatar. */
export const useVoicePeople = (guildId: Snowflake) => {
  const { data: members = [] } = useQuery(membersQueryOptions(useApi(), guildId))
  return (userId: Snowflake): { name: string; user: PublicUser | null } => {
    const member = members.find((m) => m.user.id === userId)
    if (!member) return { name: userId, user: null }
    return {
      name: member.nickname ?? member.user.displayName ?? member.user.username,
      user: member.user,
    }
  }
}
