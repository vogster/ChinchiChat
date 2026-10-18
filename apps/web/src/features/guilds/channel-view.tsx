import { Link, useNavigate } from '@tanstack/react-router'
import { Bell, ChevronRight, Megaphone, MessagesSquare, Pin, Rss, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { headerButtonClass, PageHeader, PageTitle } from '../../components/layout/page-header'
import { FollowDialog } from '../announcements/follow-dialog'
import { PinsDialog } from '../messages/pins-dialog'
import { NotificationSettingsDialog } from '../notifications/notification-settings-dialog'
import { SearchBox } from '../search/search-box'
import { SearchPanel } from '../search/search-panel'
import { ThreadPanel } from '../threads/thread-panel'
import { ChannelChat } from './channel-chat'
import { MembersPanel } from './members-panel'
import { MembersStackButton } from './members-stack-button'
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

  const glyph = parent ? (
    <MessagesSquare className="size-5" />
  ) : channel.announcement ? (
    <Megaphone className="size-5" />
  ) : (
    '#'
  )

  return (
    <>
      <MainCard>
        <PageHeader>
          {parent ? (
            <Link
              to="/channels/$guildId/$channelId"
              params={{ guildId: guild.id, channelId: parent.id }}
              aria-label={t('threads.back', { name: parent.name })}
              className="flex shrink-0 items-center gap-0.5 rounded-full py-1 pr-1 pl-2 text-[13px] text-muted hover:bg-field hover:text-text"
            >
              <span className="hidden max-w-28 truncate sm:inline">#{parent.name}</span>
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : null}
          <PageTitle
            glyph={glyph}
            title={channel.name}
            subtitle={channel.topic}
            badge={
              channel.nsfw ? (
                <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
                  {t('nsfw.badge')}
                </span>
              ) : null
            }
          />
          <MembersStackButton
            guildId={guild.id}
            aria-pressed={showMembers}
            aria-label={showMembers ? t('guild.hideMembers') : t('guild.showMembers')}
            onClick={() => setShowMembers((value) => !value)}
            className="hidden xl:flex"
          />
          <MembersStackButton
            guildId={guild.id}
            aria-label={t('guild.showMembers')}
            onClick={() => setNarrow('members')}
            className="flex xl:hidden"
          />
          <button
            type="button"
            aria-label={t('search.open')}
            aria-pressed={narrow === 'search'}
            onClick={() => setNarrow((value) => (value === 'search' ? null : 'search'))}
            className={`${headerButtonClass} lg:hidden`}
          >
            <Search aria-hidden className="size-5" />
          </button>
          <SearchBox onSearch={setSearch} open={narrow === 'search'} />
          <div className="flex shrink-0 gap-0.5">
            {channel.type === 'text' ? (
              <button
                type="button"
                aria-label={t('threads.list')}
                title={t('threads.list')}
                aria-pressed={thread !== undefined}
                onClick={() => setThread(thread === undefined ? 'list' : undefined)}
                className={headerButtonClass}
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
                className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-field hover:text-text"
              >
                <Rss aria-hidden className="size-5" />
                <span className="hidden sm:inline">{t('announcements.followShort')}</span>
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t('notifications.channelButton')}
              title={t('notifications.channelButton')}
              onClick={() => setNotifications(true)}
              className={headerButtonClass}
            >
              <Bell aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('messages.pins')}
              title={t('messages.pins')}
              onClick={() => setShowPins(true)}
              className={headerButtonClass}
            >
              <Pin aria-hidden className="size-5" />
            </button>
          </div>
        </PageHeader>

        {channel.nsfw && !nsfwOk ? (
          <NsfwGate onAccept={acceptNsfw} />
        ) : (
          <ChannelChat guild={guild} channel={channel} autoOpenRules />
        )}
      </MainCard>
      {channel.nsfw && !nsfwOk ? null : (
        <>
          {narrow === 'members' && search === null ? (
            <button
              type="button"
              aria-label={t('guild.hideMembers')}
              onClick={() => setNarrow(null)}
              className="fixed inset-0 z-30 bg-[rgb(8_8_16/0.5)] backdrop-blur-[3px] xl:hidden"
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
                if (window.matchMedia?.('(min-width: 1280px)').matches ?? true) return
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
        </>
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
    </>
  )
}
