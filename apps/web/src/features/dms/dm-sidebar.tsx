import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Lock, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { UserPanel } from '../../components/layout/user-panel'
import { Avatar } from '../../components/ui/avatar'
import { useApi } from '../../lib/api-context'
import { useIncomingRequests } from '../friends/use-incoming-requests'
import { formatMentionCount, useMentionCounts } from '../messages/mentions'
import { isUnread, useReadStates } from '../messages/use-messages'
import { CreateGroupDialog } from './dialogs/create-group-dialog'
import { privateChannelName } from './dm-names'
import { dmsQueryOptions } from './queries'

import type { PrivateChannel } from '@chinchi/shared'

const rowClass =
  'flex items-center gap-2 rounded px-2 py-1.5 text-muted hover:bg-hover hover:text-text data-[status=active]:bg-hover data-[status=active]:text-text'

const DmRow = ({ channel }: { channel: PrivateChannel }) => {
  const { t } = useTranslation()
  const readStates = useReadStates()
  const mentions = useMentionCounts()[channel.id] ?? 0
  const unread = readStates !== undefined && isUnread(channel.lastMessageId, readStates[channel.id])
  const name = privateChannelName(t, channel)
  const [first] = channel.recipients
  const states = [
    channel.encrypted ? t('e2ee.listState') : null,
    unread ? t('messages.unread') : null,
    mentions > 0 ? t('messages.mentionCount', { count: mentions }) : null,
  ].filter(Boolean)

  return (
    <li>
      <Link
        to="/channels/@me/$channelId"
        params={{ channelId: channel.id }}
        data-unread={unread}
        aria-label={states.length > 0 ? `${name} (${states.join(', ')})` : name}
        className={`${rowClass} data-[unread=true]:font-semibold data-[unread=true]:text-text`}
      >
        {channel.type === 'dm' && first ? (
          <Avatar name={name} src={first.avatarUrl} id={first.id} className="size-8" />
        ) : (
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated"
          >
            <Users className="size-4" />
          </span>
        )}
        <span className="truncate">{name}</span>
        {channel.encrypted ? <Lock aria-hidden className="size-3.5 shrink-0 text-secure" /> : null}
        {mentions > 0 ? (
          <span
            aria-hidden
            className="ml-auto rounded-full bg-danger px-1.5 text-xs leading-4 font-bold text-danger-contrast"
          >
            {formatMentionCount(mentions)}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

/** Second column on the home screen: friends and the user's DMs. */
export const DmSidebar = () => {
  const { t } = useTranslation()
  const { data: channels = [] } = useQuery(dmsQueryOptions(useApi()))
  const [creating, setCreating] = useState(false)
  const requests = useIncomingRequests()

  return (
    <aside aria-label={t('dm.title')} className="flex w-60 shrink-0 flex-col bg-sidebar">
      <header className="flex h-12 items-center border-b border-border px-4 font-semibold shadow-sm">
        {t('dm.title')}
      </header>

      <nav aria-label={t('dm.title')} className="flex-1 overflow-y-auto px-2 py-3">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          aria-label={
            requests > 0
              ? `${t('dm.friends')} (${t('friends.incomingCount', { count: requests })})`
              : t('dm.friends')
          }
          className={`${rowClass} font-medium`}
        >
          <Users aria-hidden className="size-5" />
          {t('dm.friends')}
          {requests > 0 ? (
            <span
              aria-hidden
              className="ml-auto rounded-full bg-danger px-1.5 text-xs leading-4 font-bold text-danger-contrast"
            >
              {formatMentionCount(requests)}
            </span>
          ) : null}
        </Link>

        <div className="mt-4 mb-1 flex items-center px-2 text-xs font-bold tracking-wide text-muted uppercase">
          <span className="flex-1">{t('dm.title')}</span>
          <button
            type="button"
            aria-label={t('dm.create')}
            title={t('dm.create')}
            onClick={() => setCreating(true)}
            className="rounded p-0.5 hover:text-text"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>

        {channels.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted">{t('dm.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {channels.map((channel) => (
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
