import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { membersQueryOptions } from '../guilds/queries'
import { useMemberNames } from '../guilds/use-member-names'
import { useNsfwConsent } from '../guilds/use-nsfw-consent'
import { resolveSearch } from './search-query'
import { SearchResultsPanel } from './search-results-panel'

import type { GuildDetail } from '@chinchi/shared'

/** Search results for a server, in place of the member list. */
export const SearchPanel = ({
  guild,
  input,
  onClose,
  onJumped,
}: {
  guild: GuildDetail
  input: string
  onClose: () => void
  /** A result was brought into view (narrow screens then close the panel to show it). */
  onJumped?: () => void
}) => {
  const api = useApi()
  const navigate = useNavigate()
  const nameOf = useMemberNames(guild.id)
  const { data: members, isSuccess: membersLoaded } = useQuery(membersQueryOptions(api, guild.id))
  const [nsfwOk] = useNsfwConsent()
  const channelOf = (id: string) => guild.channels.find((c) => c.id === id)
  const resolved = membersLoaded
    ? resolveSearch(input, {
        unknownAuthor: 'member',
        authorNamed: (name) =>
          members.find(
            (m) =>
              m.user.username.toLowerCase() === name ||
              m.nickname?.toLowerCase() === name ||
              m.user.displayName?.toLowerCase() === name,
          )?.user.id,
        channelNamed: (name) =>
          guild.channels.find((c) => c.type === 'text' && c.name.toLowerCase() === name)?.id,
      })
    : null

  return (
    <SearchResultsPanel
      scopeId={guild.id}
      resolved={resolved}
      search={(query) => api.search.guild(guild.id, query)}
      go={(channelId) =>
        navigate({ to: '/channels/$guildId/$channelId', params: { guildId: guild.id, channelId } })
      }
      nameOf={nameOf}
      placeOf={(message) => `#${channelOf(message.channelId)?.name ?? '?'}`}
      // Age-restricted channels stay behind their consent, here too.
      hidden={(message) => Boolean(channelOf(message.channelId)?.nsfw) && !nsfwOk}
      mentions={{ guildId: guild.id }}
      onClose={onClose}
      onJumped={onJumped}
    />
  )
}
