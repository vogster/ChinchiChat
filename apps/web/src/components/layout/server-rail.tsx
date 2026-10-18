import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MessageCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dmsQueryOptions } from '../../features/dms/queries'
import { useIncomingRequests } from '../../features/friends/use-incoming-requests'
import { CreateGuildDialog } from '../../features/guilds/create-guild-dialog'
import { GuildIcon } from '../../features/guilds/guild-icon'
import { guildQueryOptions, guildsQueryOptions } from '../../features/guilds/queries'
import { formatMentionCount, useMentionCounts } from '../../features/messages/mentions'
import { isUnread, useReadStates } from '../../features/messages/use-messages'
import {
  useGuildMuted,
  useNotificationResolver,
} from '../../features/notifications/use-notifications'
import { useApi } from '../../lib/api-context'

import type { ReactNode } from 'react'

const RailItem = ({ label, children }: { label: string; children: ReactNode }) => (
  <li className="group relative flex" title={label}>
    {children}
  </li>
)

// Shape and focus only. Colors live in the variants below so utilities never compete
// for the same CSS property (Tailwind resolves such conflicts by stylesheet order, not class order).
const railButtonBase =
  'flex size-12 max-md:size-[52px] max-md:rounded-[18px] items-center justify-center overflow-hidden rounded-tile transition duration-200 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// The open server wears a ring: a gap of the panel colour, then the accent.
const activeRing =
  'data-[status=active]:shadow-[0_0_0_3px_var(--zl-side),0_0_0_5px_var(--zl-accent)]'

const homeLinkClass = `${railButtonBase} bg-field text-text data-[status=active]:bg-accent data-[status=active]:text-accent-contrast`

const guildLinkClass = `${railButtonBase} bg-field text-text ${activeRing}`

const railActionClass = `${railButtonBase} bg-field text-muted hover:text-text`

const countBadge =
  'pointer-events-none absolute -right-1 -bottom-1 min-w-5 rounded-full border-[2.5px] border-side bg-danger px-1 text-center text-[11px] leading-[15px] font-semibold text-danger-contrast'

export const ServerRail = () => {
  const { t } = useTranslation()
  const api = useApi()
  const { data: guilds = [] } = useQuery(guildsQueryOptions(api))
  const details = useQueries({
    queries: guilds.map((guild) => guildQueryOptions(api, guild.id)),
  })
  const readStates = useReadStates()
  const resolveNotifications = useNotificationResolver()
  const isGuildMuted = useGuildMuted()
  // Muted servers and channels keep quiet: no unread marker (mentions still show).
  const unreadGuilds = new Set(
    readStates === undefined
      ? []
      : details
          .map((query) => query.data)
          .filter(
            (guild) =>
              guild !== undefined &&
              !isGuildMuted(guild.id) &&
              guild.channels.some(
                (c) =>
                  c.type === 'text' &&
                  isUnread(c.lastMessageId, readStates[c.id]) &&
                  !resolveNotifications(c, guild.channels).muted,
              ),
          )
          .map((guild) => guild?.id),
  )
  const mentionCounts = useMentionCounts()
  const mentionsIn = (guildId: string) =>
    (details.find((query) => query.data?.id === guildId)?.data?.channels ?? []).reduce(
      (sum, channel) => sum + (mentionCounts[channel.id] ?? 0),
      0,
    )
  const labelOf = (guildId: string, name: string) => {
    const mentions = mentionsIn(guildId)
    const states = [
      isGuildMuted(guildId) ? t('notifications.mutedState') : null,
      unreadGuilds.has(guildId) ? t('messages.unread') : null,
      mentions > 0 ? t('messages.mentionCount', { count: mentions }) : null,
    ].filter(Boolean)
    return states.length > 0 ? `${name} (${states.join(', ')})` : name
  }
  const [creating, setCreating] = useState(false)
  // Every unread DM message counts like a mention; the home button sums them up.
  const { data: dms = [] } = useQuery(dmsQueryOptions(api))
  const dmUnread = dms
    .filter((channel) => !resolveNotifications(channel).muted)
    .reduce((sum, channel) => sum + (mentionCounts[channel.id] ?? 0), 0)
  const requests = useIncomingRequests()
  const homeStates = [
    dmUnread > 0 ? t('nav.dmUnread', { count: dmUnread }) : null,
    requests > 0 ? t('friends.incomingCount', { count: requests }) : null,
  ].filter(Boolean)
  const homeLabel =
    homeStates.length > 0 ? `${t('nav.home')} (${homeStates.join(', ')})` : t('nav.home')
  const homeCount = dmUnread + requests

  return (
    <nav
      aria-label={t('nav.servers')}
      className="flex shrink-0 overflow-x-auto [scrollbar-width:none] max-md:px-4 max-md:pt-4 max-md:pb-3.5 md:w-[76px] md:flex-col md:overflow-y-auto md:rounded-panel md:bg-side md:py-3.5"
    >
      <ul className="flex items-center gap-2.5 md:flex-col">
        <RailItem label={t('nav.home')}>
          <Link
            to="/"
            aria-label={homeLabel}
            className={homeLinkClass}
            activeOptions={{ exact: true }}
          >
            <MessageCircle aria-hidden className="size-6" />
          </Link>
          {homeCount > 0 ? (
            <span aria-hidden className={countBadge}>
              {formatMentionCount(homeCount)}
            </span>
          ) : null}
        </RailItem>

        <li aria-hidden className="h-0.5 w-6 rounded-full bg-line max-md:hidden" />

        {guilds.map((guild) => (
          <RailItem key={guild.id} label={guild.name}>
            <Link
              to="/channels/$guildId"
              params={{ guildId: guild.id }}
              aria-label={labelOf(guild.id, guild.name)}
              className={guildLinkClass}
            >
              <GuildIcon id={guild.id} name={guild.name} iconUrl={guild.iconUrl} />
            </Link>
            {unreadGuilds.has(guild.id) ? (
              <span
                aria-hidden
                className="pointer-events-none absolute -top-0.5 -right-0.5 size-3 rounded-full border-[2.5px] border-side bg-accent"
              />
            ) : null}
            {mentionsIn(guild.id) > 0 ? (
              <span aria-hidden className={countBadge}>
                {formatMentionCount(mentionsIn(guild.id))}
              </span>
            ) : null}
          </RailItem>
        ))}

        <RailItem label={t('nav.addServer')}>
          <button
            type="button"
            aria-label={t('nav.addServer')}
            className={railActionClass}
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden className="size-6" />
          </button>
        </RailItem>
      </ul>

      {creating ? <CreateGuildDialog open onOpenChange={setCreating} /> : null}
    </nav>
  )
}
