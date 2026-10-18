import { Link } from '@tanstack/react-router'
import { Maximize2, MessagesSquare, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ChannelChat } from '../guilds/channel-chat'
import { threadsOf } from '../guilds/channel-tree'

import type { Channel, GuildDetail } from '@chinchi/shared'
import type { ReactNode } from 'react'

/** What the side panel shows: the channel's threads, or one of them. */
export type ThreadPanelView = 'list' | (string & {})

const iconButton = 'rounded p-1 text-muted hover:text-text'

const Panel = ({
  label,
  header,
  children,
}: {
  label: string
  header: ReactNode
  children: ReactNode
}) => (
  <aside
    aria-label={label}
    // Narrow screens: the panel covers the chat; wide ones show it beside it.
    className="fixed inset-0 z-40 flex w-full min-w-0 shrink-0 flex-col overflow-hidden bg-main xl:static xl:z-auto xl:w-[26rem] xl:rounded-panel"
  >
    <header className="flex h-[68px] shrink-0 items-center gap-2 px-[18px]">{header}</header>
    {children}
  </aside>
)

const ThreadList = ({
  guild,
  channel,
  onClose,
}: {
  guild: GuildDetail
  channel: Channel
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const threads = threadsOf(guild.channels, channel.id)
  return (
    <Panel
      label={t('threads.listLabel', { name: channel.name })}
      header={
        <>
          <MessagesSquare aria-hidden className="size-5 shrink-0 text-muted" />
          <h2 className="flex-1 truncate font-semibold">{t('threads.list')}</h2>
          <button
            type="button"
            aria-label={t('threads.closeList')}
            onClick={onClose}
            className={iconButton}
          >
            <X aria-hidden className="size-4" />
          </button>
        </>
      }
    >
      {threads.length === 0 ? (
        <p className="p-4 text-sm text-muted">{t('threads.none')}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 overflow-y-auto p-2">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                to="/channels/$guildId/$channelId"
                params={{ guildId: guild.id, channelId: channel.id }}
                search={{ thread: thread.id }}
                aria-label={t('threads.chip', { name: thread.name, count: thread.messageCount })}
                className="flex flex-col rounded px-3 py-2 hover:bg-hover"
              >
                <span className="truncate font-medium">{thread.name}</span>
                <span className="text-xs text-muted">
                  {t('threads.count', { count: thread.messageCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/**
 * The side panel of a text channel: its threads, or one thread to read and answer while the
 * channel stays in view. A thread that no longer exists closes the panel.
 */
export const ThreadPanel = ({
  guild,
  channel,
  view,
  onClose,
}: {
  guild: GuildDetail
  channel: Channel
  view: ThreadPanelView
  onClose: () => void
}) => {
  const { t } = useTranslation()
  if (view === 'list') return <ThreadList guild={guild} channel={channel} onClose={onClose} />

  const thread = guild.channels.find(
    (c) => c.id === view && c.type === 'thread' && c.parentId === channel.id,
  )
  if (!thread) return null
  return (
    <Panel
      label={t('threads.welcomeTitle', { name: thread.name })}
      header={
        <>
          <MessagesSquare aria-hidden className="size-5 shrink-0 text-muted" />
          <h2 className="flex-1 truncate font-semibold">{thread.name}</h2>
          <Link
            to="/channels/$guildId/$channelId"
            params={{ guildId: guild.id, channelId: thread.id }}
            aria-label={t('threads.openFull')}
            title={t('threads.openFull')}
            className={iconButton}
          >
            <Maximize2 aria-hidden className="size-4" />
          </Link>
          <button
            type="button"
            aria-label={t('threads.close')}
            onClick={onClose}
            className={iconButton}
          >
            <X aria-hidden className="size-4" />
          </button>
        </>
      }
    >
      <ChannelChat key={thread.id} guild={guild} channel={thread} />
    </Panel>
  )
}
