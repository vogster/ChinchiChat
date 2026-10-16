import { queryOptions, useQuery } from '@tanstack/react-query'

import type { Snowflake, VoiceState } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

/** userId → where they are in voice; users not in voice are absent. */
export type VoiceStates = Readonly<Record<Snowflake, VoiceState>>

export const voiceKeys = {
  states: ['voiceStates'] as const,
  /** DM calls the user declined; forgotten once the call ends. */
  declined: ['declinedCalls'] as const,
}

/** Filled by the gateway (READY and VOICE_STATE_UPDATE), never fetched. */
export const voiceStatesQueryOptions = () =>
  queryOptions({
    queryKey: voiceKeys.states,
    queryFn: (): VoiceStates => ({}),
    staleTime: Infinity,
  })

export const useVoiceStates = (): VoiceStates => useQuery(voiceStatesQueryOptions()).data ?? {}

/** Everyone in a channel, in a stable order. */
export const statesInChannel = (states: VoiceStates, channelId: Snowflake): VoiceState[] =>
  Object.values(states)
    .filter((state) => state.channelId === channelId)
    .sort((a, b) => a.userId.localeCompare(b.userId))

export const seedVoiceStates = (queryClient: QueryClient, states: readonly VoiceState[]) =>
  queryClient.setQueryData<VoiceStates>(
    voiceKeys.states,
    Object.fromEntries(states.map((state) => [state.userId, state])),
  )

/** `channelId: null` means they left. */
export const applyVoiceState = (queryClient: QueryClient, state: VoiceState) => {
  const previous = queryClient.getQueryData<VoiceStates>(voiceKeys.states)?.[state.userId]
  const next = queryClient.setQueryData<VoiceStates>(voiceKeys.states, (states = {}) => {
    const { [state.userId]: _previous, ...rest } = states
    return state.channelId === null ? rest : { ...rest, [state.userId]: state }
  })
  // A DM call that emptied is over: the next one in that DM rings again.
  const left = previous?.guildId === null ? previous.channelId : null
  if (left && !Object.values(next ?? {}).some((s) => s.channelId === left)) {
    queryClient.setQueryData<readonly Snowflake[]>(voiceKeys.declined, (ids = []) =>
      ids.filter((id) => id !== left),
    )
  }
}

export const declinedCallsQueryOptions = () =>
  queryOptions({
    queryKey: voiceKeys.declined,
    queryFn: (): readonly Snowflake[] => [],
    staleTime: Infinity,
  })

export const useDeclinedCalls = (): readonly Snowflake[] =>
  useQuery(declinedCallsQueryOptions()).data ?? []

export const declineCall = (queryClient: QueryClient, channelId: Snowflake) =>
  queryClient.setQueryData<readonly Snowflake[]>(voiceKeys.declined, (ids = []) =>
    ids.includes(channelId) ? ids : [...ids, channelId],
  )

/** A deleted channel takes its voice states with it. */
export const dropVoiceChannel = (queryClient: QueryClient, channelId: Snowflake) =>
  queryClient.setQueryData<VoiceStates>(voiceKeys.states, (states) =>
    states
      ? Object.fromEntries(
          Object.entries(states).filter(([, state]) => state.channelId !== channelId),
        )
      : states,
  )
