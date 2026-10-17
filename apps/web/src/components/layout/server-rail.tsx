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
  <li className="group relative flex justify-center" title={label}>
    {children}
  </li>
)

// Shape and focus only. Colors live in the variants below so utilities never compete
// for the same CSS property (Tailwind resolves such conflicts by stylesheet order, not class order).
const railButtonBase =
  'flex size-12 items-center justify-center overflow-hidden rounded-3xl bg-elevated transition-all duration-150 hover:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const railLinkClass = `${railButtonBase} text-text hover:bg-accent hover:text-accent-contrast data-[status=active]:rounded-2xl data-[status=active]:bg-accent data-[status=active]:text-accent-contrast`

const railActionClass = `${railButtonBase} text-green-600 hover:bg-green-600 hover:text-white`

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
      className="flex w-[72px] shrink-0 flex-col overflow-y-auto bg-rail py-3"
    >
      <ul className="flex flex-col gap-2">
        <RailItem label={t('nav.home')}>
          <Link
            to="/"
            aria-label={homeLabel}
            className={railLinkClass}
            activeOptions={{ exact: true }}
          >
            <MessageCircle aria-hidden className="size-6" />
          </Link>
          {homeCount > 0 ? (
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 bottom-0 rounded-full border-4 border-rail bg-danger px-1 text-xs leading-3.5 font-bold text-danger-contrast"
            >
              {formatMentionCount(homeCount)}
            </span>
          ) : null}
        </RailItem>

        <li aria-hidden className="mx-auto h-0.5 w-8 rounded bg-elevated" />

        {guilds.map((guild) => (
          <RailItem key={guild.id} label={guild.name}>
            {unreadGuilds.has(guild.id) ? (
              <span
                aria-hidden
                className="absolute top-1/2 left-0 h-2 w-1 -translate-y-1/2 rounded-r bg-text"
              />
            ) : null}
            <Link
              to="/channels/$guildId"
              params={{ guildId: guild.id }}
              aria-label={labelOf(guild.id, guild.name)}
              className={railLinkClass}
            >
              <GuildIcon id={guild.id} name={guild.name} iconUrl={guild.iconUrl} />
            </Link>
            {mentionsIn(guild.id) > 0 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute right-2 bottom-0 rounded-full border-4 border-rail bg-danger px-1 text-xs leading-3.5 font-bold text-danger-contrast"
              >
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
