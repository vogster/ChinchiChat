import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UserPanel } from '../../components/layout/user-panel'
import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { useApi } from '../../lib/api-context'
import { useIncomingRequests } from '../friends/use-incoming-requests'
import { formatMentionCount, useMentionCounts } from '../messages/mentions'
import { isUnread, useReadStates } from '../messages/use-messages'
import { usePresence } from '../messages/use-presence'
import { customStatusText, useCustomStatus } from '../presence/use-custom-status'
import { CreateGroupDialog } from './dialogs/create-group-dialog'
import { privateChannelName } from './dm-names'
import { DmRowMenu } from './dm-row-menu'
import { dmsQueryOptions } from './queries'

import type { PrivateChannel } from '@chinchi/shared'

const rowClass =
  'flex items-center gap-3 rounded-tile px-2.5 text-muted transition-colors hover:bg-field hover:text-text data-[status=active]:bg-accent-soft data-[status=active]:text-accent-text'

const countBadge =
  'grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-danger-contrast'

/** Under the name: encryption, the person's own status, or how many are in the group. */
const useSubtitle = (channel: PrivateChannel) => {
  const { t } = useTranslation()
  const [first] = channel.recipients
  const presence = usePresence(first?.id)
  const custom = useCustomStatus(channel.type === 'dm' ? first?.id : undefined)
  if (channel.encrypted) return t('e2ee.listSubtitle')
  if (channel.type === 'group_dm') {
    return t('dm.groupSize', { count: channel.recipients.length + 1 })
  }
  return custom ? customStatusText(custom) : t(`presence.${presence}`)
}

const DmRow = ({ channel }: { channel: PrivateChannel }) => {
  const { t } = useTranslation()
  const readStates = useReadStates()
  const mentions = useMentionCounts()[channel.id] ?? 0
  const unread = readStates !== undefined && isUnread(channel.lastMessageId, readStates[channel.id])
  const name = privateChannelName(t, channel)
  const [first] = channel.recipients
  const status = usePresence(first?.id)
  const subtitle = useSubtitle(channel)
  const states = [
    channel.encrypted ? t('e2ee.listState') : null,
    unread ? t('messages.unread') : null,
    mentions > 0 ? t('messages.mentionCount', { count: mentions }) : null,
  ].filter(Boolean)

  return (
    <li className="group relative">
      <Link
        to="/channels/@me/$channelId"
        params={{ channelId: channel.id }}
        data-unread={unread}
        aria-label={states.length > 0 ? `${name} (${states.join(', ')})` : name}
        className={`${rowClass} py-2 pr-9 data-[unread=true]:text-text`}
      >
        <span className="relative shrink-0">
          {channel.type === 'dm' && first ? (
            <>
              <Avatar
                name={name}
                src={first.avatarUrl}
                id={first.id}
                rounded="rounded-[14px]"
                className="size-10"
              />
              <PresenceDot status={status} label={t(`presence.${status}`)} />
            </>
          ) : (
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-[14px] bg-field text-muted"
            >
              <Users className="size-[18px]" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate ${unread ? 'font-semibold' : 'font-medium'}`}>{name}</span>
            {channel.encrypted ? (
              <Lock aria-hidden className="size-3.5 shrink-0 text-secure-text" />
            ) : null}
          </span>
          <span className="block truncate text-[12.5px] text-faint">{subtitle}</span>
        </span>
        {mentions > 0 ? (
          <span
            aria-hidden
            className={`${countBadge} group-focus-within:invisible group-hover:invisible`}
          >
            {formatMentionCount(mentions)}
          </span>
        ) : null}
      </Link>
      <DmRowMenu channel={channel} name={name} />
    </li>
  )
}

/** Second column on the home screen: friends and the user's DMs. */
export const DmSidebar = () => {
  const { t } = useTranslation()
  const { data: channels = [] } = useQuery(dmsQueryOptions(useApi()))
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const requests = useIncomingRequests()
  const needle = query.trim().toLocaleLowerCase()
  const shown = needle
    ? channels.filter((channel) =>
        privateChannelName(t, channel).toLocaleLowerCase().includes(needle),
      )
    : channels

  return (
    <aside
      aria-label={t('dm.title')}
      className="flex min-h-0 flex-1 flex-col overflow-hidden md:w-[280px] md:flex-none md:shrink-0 md:rounded-panel md:bg-side"
    >
      <header className="flex flex-col gap-3 px-[18px] pt-[18px] pb-2.5">
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{t('dm.heading')}</h2>
        <input
          type="search"
          aria-label={t('dm.search')}
          placeholder={t('dm.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-[38px] rounded-full bg-field px-4 text-[13px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
        />
      </header>

      <nav aria-label={t('dm.title')} className="flex-1 overflow-y-auto px-2.5 pb-2.5">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          aria-label={
            requests > 0
              ? `${t('dm.friends')} (${t('friends.incomingCount', { count: requests })})`
              : t('dm.friends')
          }
          className={`${rowClass} h-12 font-medium`}
        >
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-field"
          >
            <Users className="size-[18px]" />
          </span>
          <span className="flex-1">{t('dm.friends')}</span>
          {requests > 0 ? (
            <span aria-hidden className={countBadge}>
              {formatMentionCount(requests)}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center px-2.5 pt-3 pb-1 text-[12.5px] font-medium text-faint">
          <span className="flex-1">{t('dm.title')}</span>
          <button
            type="button"
            aria-label={t('dm.create')}
            title={t('dm.create')}
            onClick={() => setCreating(true)}
            className="grid size-6 place-items-center rounded-full hover:bg-chip hover:text-text"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-faint">
            {needle ? t('dm.searchEmpty') : t('dm.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((channel) => (
              <DmRow key={channel.id} channel={channel} />
            ))}
          </ul>
        )}
      </nav>

      <UserPanel />
      {creating ? <CreateGroupDialog onOpenChange={setCreating} /> : null}
    </aside>
  )
}
