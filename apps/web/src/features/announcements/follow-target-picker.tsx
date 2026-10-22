import { Permission } from '@chinchi/shared'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Check, Hash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { guildQueryOptions, guildsQueryOptions } from '../guilds/queries'
import { can, channelPermissions } from '../permissions/permissions'

import type { Snowflake } from '@chinchi/shared'

export interface FollowTarget {
  readonly channelId: Snowflake
  /** "Server · #channel", as the list shows it. */
  readonly label: string
}

/** Text channels on any of the user's servers that they manage: where a follow can go. */
const useFollowTargets = (sourceId: Snowflake): FollowTarget[] => {
  const api = useApi()
  const me = useCurrentUser()
  const { data: guilds = [] } = useQuery(guildsQueryOptions(api))
  // READY already filled these in: no request per server.
  const details = useQueries({
    queries: guilds.map((guild) => guildQueryOptions(api, guild.id)),
  })
  if (!me) return []
  return details.flatMap(({ data: guild }) =>
    guild
      ? guild.channels
          .filter(
            (channel) =>
              channel.type === 'text' &&
              channel.id !== sourceId &&
              can(channelPermissions(guild, channel, me.id), Permission.ManageChannels),
          )
          .map((channel) => ({ channelId: channel.id, label: `${guild.name} · #${channel.name}` }))
      : [],
  )
}

/**
 * One list of every place a follow can go, searchable; where the channel already comes is shown
 * but can't be picked again.
 */
export const FollowTargetPicker = ({
  sourceId,
  following,
  value,
  onChange,
}: {
  sourceId: Snowflake
  /** Channels already following the source. */
  following: ReadonlySet<Snowflake>
  value: Snowflake | null
  onChange: (channelId: Snowflake) => void
}) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const targets = useFollowTargets(sourceId)
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? targets.filter((target) => target.label.toLowerCase().includes(needle))
    : targets

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        aria-label={t('announcements.search')}
        placeholder={t('announcements.search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-11 rounded-field bg-field px-4 outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
      />
      {targets.length === 0 ? (
        <p className="text-sm text-muted">{t('announcements.noTargets')}</p>
      ) : (
        <ul
          role="listbox"
          aria-label={t('announcements.targets')}
          className="flex max-h-60 flex-col gap-0.5 overflow-y-auto"
        >
          {shown.map((target) => {
            const taken = following.has(target.channelId)
            const selected = value === target.channelId
            const pick = () => {
              if (!taken) onChange(target.channelId)
            }
            return (
              <li
                key={target.channelId}
                role="option"
                aria-selected={selected}
                aria-disabled={taken}
                tabIndex={taken ? -1 : 0}
                onClick={pick}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  pick()
                }}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-field px-3 outline-none hover:bg-field focus-visible:ring-2 focus-visible:ring-accent aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:hover:bg-transparent aria-selected:bg-accent-soft aria-selected:text-accent-text"
              >
                <Hash aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
                {taken ? (
                  <span className="shrink-0 text-xs">{t('announcements.alreadyFollowing')}</span>
                ) : selected ? (
                  <Check aria-hidden className="size-4 shrink-0" />
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
