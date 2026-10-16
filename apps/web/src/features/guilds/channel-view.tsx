import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  ChevronRight,
  Hash,
  Megaphone,
  MessagesSquare,
  Pin,
  Rss,
  Search,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../../components/layout/page-header'
import { FollowDialog } from '../announcements/follow-dialog'
import { PinsDialog } from '../messages/pins-dialog'
import { NotificationSettingsDialog } from '../notifications/notification-settings-dialog'
import { SearchBox } from '../search/search-box'
import { SearchPanel } from '../search/search-panel'
import { ThreadPanel } from '../threads/thread-panel'
import { ChannelChat } from './channel-chat'
import { MembersPanel } from './members-panel'
import { NsfwGate } from './nsfw-gate'
import { useNsfwConsent } from './use-nsfw-consent'

import type { ThreadPanelView } from '../threads/thread-panel'
import type { Channel, GuildDetail } from '@chinchi/shared'

export const ChannelView = ({
  guild,
  channel,
  thread,
}: {
  guild: GuildDetail
  channel: Channel
  /** The side panel's content: the channel's threads or one of them (text channels only). */
  thread?: ThreadPanelView | undefined
}) => {
  const { t } = useTranslation()
  const [showMembers, setShowMembers] = useState(true)
  // Narrow screens open one side panel at a time, over the chat.
  const [narrow, setNarrow] = useState<'members' | 'search' | null>(null)
  const [showPins, setShowPins] = useState(false)
  const [following, setFollowing] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  // A thread shows the way back to its channel.
  const parent =
    channel.type === 'thread' ? guild.channels.find((c) => c.id === channel.parentId) : undefined
  const [nsfwOk, acceptNsfw] = useNsfwConsent()
  const navigate = useNavigate()
  const setThread = (value: ThreadPanelView | undefined) =>
    void navigate({
      to: '/channels/$guildId/$channelId',
      params: { guildId: guild.id, channelId: channel.id },
      search: value ? { thread: value } : {},
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        {parent ? (
          <Link
            to="/channels/$guildId/$channelId"
            params={{ guildId: guild.id, channelId: parent.id }}
            aria-label={t('threads.back', { name: parent.name })}
            className="flex shrink-0 items-center gap-1 rounded px-1 text-sm font-normal text-muted hover:text-text"
          >
            <Hash aria-hidden className="size-4" />
            <span className="hidden sm:inline">{parent.name}</span>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : null}
        {parent ? (
          <MessagesSquare aria-hidden className="size-5 shrink-0 text-muted" />
        ) : channel.announcement ? (
          <Megaphone aria-hidden className="size-5 shrink-0 text-muted" />
        ) : (
          <Hash aria-hidden className="size-5 shrink-0 text-muted" />
        )}
        <h1 className="truncate">{channel.name}</h1>
        {channel.nsfw ? (
          <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-xs text-muted">
            {t('nsfw.badge')}
          </span>
        ) : null}
        {channel.topic ? (
          <p className="hidden truncate border-l border-border pl-3 text-sm font-normal text-muted sm:block">
            {channel.topic}
          </p>
        ) : null}
        <button
          type="button"
          aria-label={t('search.open')}
          aria-pressed={narrow === 'search'}
          onClick={() => setNarrow((value) => (value === 'search' ? null : 'search'))}
          className="ml-auto rounded p-1.5 text-muted hover:text-text aria-pressed:text-text lg:hidden"
        >
          <Search aria-hidden className="size-5" />
        </button>
        <SearchBox className="lg:ml-auto" onSearch={setSearch} open={narrow === 'search'} />
        {channel.type === 'text' ? (
          <button
            type="button"
            aria-label={t('threads.list')}
            title={t('threads.list')}
            aria-pressed={thread !== undefined}
            onClick={() => setThread(thread === undefined ? 'list' : undefined)}
            className="rounded p-1.5 text-muted hover:text-text aria-pressed:text-text"
          >
            <MessagesSquare aria-hidden className="size-5" />
          </button>
        ) : null}
        {channel.announcement ? (
          <button
            type="button"
            aria-label={t('announcements.followButton')}
            title={t('announcements.followButton')}
            onClick={() => setFollowing(true)}
            className="rounded p-1.5 text-muted hover:text-text"
          >
            <Rss aria-hidden className="size-5" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={t('notifications.channelButton')}
          title={t('notifications.channelButton')}
          onClick={() => setNotifications(true)}
          className="rounded p-1.5 text-muted hover:text-text"
        >
          <Bell aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t('messages.pins')}
          title={t('messages.pins')}
          onClick={() => setShowPins(true)}
          className="rounded p-1.5 text-muted hover:text-text"
        >
          <Pin aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-pressed={showMembers}
          aria-label={showMembers ? t('guild.hideMembers') : t('guild.showMembers')}
          onClick={() => setShowMembers((value) => !value)}
          className="hidden rounded p-1.5 text-muted hover:text-text aria-pressed:text-text lg:block"
        >
          <Users aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t('guild.showMembers')}
          onClick={() => setNarrow('members')}
          className="rounded p-1.5 text-muted hover:text-text lg:hidden"
        >
          <Users aria-hidden className="size-5" />
        </button>
      </PageHeader>

      {channel.nsfw && !nsfwOk ? (
        <NsfwGate onAccept={acceptNsfw} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ChannelChat guild={guild} channel={channel} autoOpenRules />
          {narrow === 'members' && search === null ? (
            <button
              type="button"
              aria-label={t('guild.hideMembers')}
              onClick={() => setNarrow(null)}
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            />
          ) : null}
          {search !== null ? (
            <SearchPanel
              guild={guild}
              input={search}
              onClose={() => {
                setSearch(null)
                setNarrow(null)
              }}
              onJumped={() => {
                // On a phone the results cover the chat: step aside to show the message.
                if (window.matchMedia?.('(min-width: 1024px)').matches ?? true) return
                setSearch(null)
                setNarrow(null)
              }}
            />
          ) : thread !== undefined && channel.type === 'text' ? (
            <ThreadPanel
              guild={guild}
              channel={channel}
              view={thread}
              onClose={() => setThread(undefined)}
            />
          ) : showMembers || narrow === 'members' ? (
            <MembersPanel guild={guild} narrowOpen={narrow === 'members'} />
          ) : null}
        </div>
      )}

      {showPins ? <PinsDialog channel={channel} onOpenChange={setShowPins} /> : null}
      {following ? <FollowDialog channel={channel} onOpenChange={setFollowing} /> : null}
      {notifications ? (
        <NotificationSettingsDialog
          targetId={channel.id}
          kind="channel"
          name={`#${channel.name}`}
          onClose={() => setNotifications(false)}
        />
      ) : null}
    </div>
  )
}
