import { Permission } from '@chinchi/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  ChevronRight,
  Ellipsis,
  Megaphone,
  MessagesSquare,
  Pin,
  Rss,
  Search,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { headerButtonClass, PageHeader, PageTitle } from '../../components/layout/page-header'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'
import { FollowButton } from '../announcements/follow-button'
import { FollowDialog } from '../announcements/follow-dialog'
import { PinsPopover } from '../messages/pins-popover'
import { NotificationSettingsPopover } from '../notifications/notification-settings-dialog'
import { can } from '../permissions/permissions'
import { useGuildPermissions } from '../permissions/use-guild-permissions'
import { SearchBox } from '../search/search-box'
import { SearchPanel } from '../search/search-panel'
import { ThreadPanel } from '../threads/thread-panel'
import { ThreadsPopover } from '../threads/threads-popover'
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
  const canUnpin = can(useGuildPermissions(guild).inChannel(channel), Permission.ManageMessages)
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
                aria-pressed={thread === 'list'}
                onClick={() => setThread(thread === 'list' ? undefined : 'list')}
                className={headerButtonClass}
              >
                <MessagesSquare aria-hidden className="size-5" />
              </button>
            ) : null}
            {channel.announcement ? (
              <FollowButton
                channelId={channel.id}
                onClick={() => setFollowing(true)}
                className={`${headerButtonClass} max-md:hidden`}
              />
            ) : null}
            <button
              type="button"
              aria-label={t('notifications.channelButton')}
              title={t('notifications.channelButton')}
              aria-pressed={notifications}
              onClick={() => {
                setShowPins(false)
                setNotifications((value) => !value)
              }}
              className={`${headerButtonClass} max-md:hidden`}
            >
              <Bell aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              aria-label={t('messages.pins')}
              title={t('messages.pins')}
              aria-pressed={showPins}
              onClick={() => {
                setNotifications(false)
                setShowPins((value) => !value)
              }}
              className={`${headerButtonClass} max-md:hidden`}
            >
              <Pin aria-hidden className="size-5" />
            </button>
            {/* Phones: the header has no room for these, so they wait behind "more". */}
            <Menu>
              <MenuTrigger
                aria-label={t('common.more')}
                className={`${headerButtonClass} md:hidden`}
              >
                <Ellipsis aria-hidden className="size-5" />
              </MenuTrigger>
              <MenuContent>
                {channel.announcement ? (
                  <MenuItem
                    onSelect={() => setFollowing(true)}
                    icon={<Rss aria-hidden className="size-4" />}
                  >
                    {t('announcements.followShort')}
                  </MenuItem>
                ) : null}
                <MenuItem
                  onSelect={() => setNotifications(true)}
                  icon={<Bell aria-hidden className="size-4" />}
                >
                  {t('notifications.channelButton')}
                </MenuItem>
                <MenuItem
                  onSelect={() => setShowPins(true)}
                  icon={<Pin aria-hidden className="size-4" />}
                >
                  {t('messages.pins')}
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </PageHeader>

        {channel.nsfw && !nsfwOk ? (
          <NsfwGate onAccept={acceptNsfw} />
        ) : (
          <ChannelChat guild={guild} channel={channel} autoOpenRules />
        )}
        {thread === 'list' && channel.type === 'text' ? (
          <ThreadsPopover guild={guild} channel={channel} onClose={() => setThread(undefined)} />
        ) : showPins ? (
          <PinsPopover channel={channel} canUnpin={canUnpin} onClose={() => setShowPins(false)} />
        ) : notifications ? (
          <NotificationSettingsPopover
            targetId={channel.id}
            kind="channel"
            name={`#${channel.name}`}
            onClose={() => setNotifications(false)}
          />
        ) : null}
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
          ) : thread !== undefined && thread !== 'list' && channel.type === 'text' ? (
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

      {following ? <FollowDialog channel={channel} onOpenChange={setFollowing} /> : null}
    </>
  )
}
