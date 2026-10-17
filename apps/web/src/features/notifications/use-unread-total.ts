import { useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { dmsQueryOptions } from '../dms/queries'
import { useIncomingRequests } from '../friends/use-incoming-requests'
import { useMentionCounts } from '../messages/mentions'
import { useNotificationResolver } from './use-notifications'

/** Unread mentions, DM messages (muted DMs aside) and friend requests, for the tab title and icon. */
export const useUnreadTotal = () => {
  const counts = useMentionCounts()
  const { data: dms = [] } = useQuery(dmsQueryOptions(useApi()))
  const resolve = useNotificationResolver()
  const requests = useIncomingRequests()
  const mutedDms = new Set(
    dms.filter((channel) => resolve(channel).muted).map((channel) => channel.id),
  )
  return Object.entries(counts).reduce(
    (sum, [channelId, count]) => (mutedDms.has(channelId) ? sum : sum + count),
    requests,
  )
}
