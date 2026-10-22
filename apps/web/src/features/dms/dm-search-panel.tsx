import { useNavigate } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { resolveSearch } from '../search/search-query'
import { SearchResultsPanel } from '../search/search-results-panel'
import { userName } from './dm-names'

import type { PrivateChannel, PublicUser } from '@chinchi/shared'

/** Search results for a DM or a group (the server searches them; encrypted ones search here). */
export const DmSearchPanel = ({
  channel,
  me,
  input,
  onClose,
}: {
  channel: PrivateChannel
  me: PublicUser
  input: string
  onClose: () => void
}) => {
  const api = useApi()
  const navigate = useNavigate()
  const people = [me, ...channel.recipients]
  const resolved = resolveSearch(input, {
    unknownAuthor: 'person',
    authorNamed: (name) =>
      people.find(
        (user) => user.username.toLowerCase() === name || user.displayName?.toLowerCase() === name,
      )?.id,
  })

  return (
    <SearchResultsPanel
      scopeId={channel.id}
      resolved={resolved}
      search={(query) => api.search.channel(channel.id, query)}
      go={(channelId) => navigate({ to: '/channels/@me/$channelId', params: { channelId } })}
      nameOf={userName}
      mentions={{ guildId: null, people }}
      onClose={onClose}
    />
  )
}
