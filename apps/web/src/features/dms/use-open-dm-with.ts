import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { dmsQueryOptions } from './queries'

import type { PrivateChannel, Snowflake } from '@chinchi/shared'

/** The 1:1 DM with this person that is on screen right now, if any. */
export const useOpenDmWith = (userId: Snowflake): PrivateChannel | undefined => {
  const api = useApi()
  const { guildId, channelId } = useParams({ strict: false })
  const { data: dms } = useQuery({ ...dmsQueryOptions(api), enabled: channelId !== undefined })
  if (guildId !== undefined || channelId === undefined) return undefined
  return dms?.find(
    (dm) => dm.id === channelId && dm.type === 'dm' && dm.recipients[0]?.id === userId,
  )
}
