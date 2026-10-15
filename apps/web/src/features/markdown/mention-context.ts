import { createContext, useContext } from 'react'

import type { Snowflake } from '@chinchi/shared'

export interface MentionResolver {
  readonly guildId: Snowflake
  /** Display name, or null if the user is not (or no longer) a member. */
  readonly user: (id: Snowflake) => string | null
  readonly role: (id: Snowflake) => { name: string; color: string | undefined } | null
  /** Only channels the viewer can see are in the cache, so hidden ones stay unknown. */
  readonly channel: (id: Snowflake) => string | null
  /** Translated once per list instead of once per node. */
  readonly labels: {
    readonly unknownUser: string
    readonly unknownRole: string
    readonly unknownChannel: string
    readonly showSpoiler: string
  }
}

export const MentionResolverContext = createContext<MentionResolver | null>(null)

export const useMentionResolver = (): MentionResolver => {
  const resolver = useContext(MentionResolverContext)
  if (!resolver) throw new Error('useMentionResolver needs a MentionResolverProvider')
  return resolver
}
