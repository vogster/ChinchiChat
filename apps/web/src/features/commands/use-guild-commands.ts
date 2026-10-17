import { useMutation, useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'

import type { Snowflake } from '@chinchi/shared'

export const guildCommandsKey = (guildId: Snowflake) => ['guilds', guildId, 'commands'] as const

/** Slash commands of the bots on a server, and running one in a channel. */
export const useGuildCommands = (guildId: Snowflake, channelId: Snowflake) => {
  const api = useApi()
  const { data: commands = [], refetch } = useQuery({
    queryKey: guildCommandsKey(guildId),
    queryFn: async () => (await api.commands.guild(guildId)).commands,
    // Bots register commands at any time: fetch afresh whenever a channel opens.
    staleTime: 0,
  })
  const invoke = useMutation({
    mutationFn: (input: { commandId: Snowflake; options: Record<string, string> }) =>
      api.interactions.invoke(channelId, input),
  })
  return { commands, invoke, refresh: () => void refetch() }
}
