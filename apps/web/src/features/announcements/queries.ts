import { queryOptions } from '@tanstack/react-query'

import type { ApiClient } from '@chinchi/sdk'
import type { ChannelFollower, Snowflake } from '@chinchi/shared'

export const followerKeys = {
  of: (channelId: Snowflake) => ['followers', channelId] as const,
}

/** Channels following an announcement channel: all for its managers, your own for others. */
export const followersQueryOptions = (api: ApiClient, channelId: Snowflake) =>
  queryOptions({
    queryKey: followerKeys.of(channelId),
    queryFn: async () => (await api.announcements.followers(channelId)).followers,
  })

/** "Server · #channel", or a stand-in where the viewer can't see that server. */
export const followerLabel = (follower: ChannelFollower, hidden: string): string =>
  follower.guildName && follower.channelName
    ? `${follower.guildName} · #${follower.channelName}`
    : hidden
