import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Hash } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { useDecryptedMessages } from '../e2ee/use-decrypted-messages'
import { guildQueryOptions, membersQueryOptions } from '../guilds/queries'
import { MentionResolverProvider } from '../markdown/mention-resolver-provider'
import { ReportDialog } from '../reports/report-dialog'
import { CreateThreadDialog } from '../threads/create-thread-dialog'
import { formatDay } from './format-time'
import { groupMessages } from './group-messages'
import { mentionsMe } from './mentions'
import { MessageItem } from './message-item'
import { flattenPages, messagesQueryOptions } from './queries'
import { SystemMessage } from './system-message'
import { UnreadBanner } from './unread-banner'
import { useAckLatest, usePublishMessage } from './use-messages'
import { useRenderWindow } from './use-render-window'
import { useUnreadMarker } from './use-unread-marker'

import type { EncryptedChannel } from '../e2ee/client'
import type { MessageItem as Item } from './queries'
import type { PublicUser } from '@chinchi/shared'
import type { ReactNode } from 'react'

/** A server text channel or a DM (`guildId: null`). */
export interface ChatChannel {
  readonly id: string
  readonly name: string
  readonly guildId: string | null
  /** Server channels say which kind they are (threads start only in text channels). */
  readonly type?: string
}

export interface MessageListProps {
  readonly channel: ChatChannel
  /** The people in a DM, to name mentions there. */
  readonly people?: readonly PublicUser[]
  /** Shown above the oldest message; a server channel's welcome by default. */
  readonly start?: ReactNode
  /** Accessible name of the history; "Messages in #channel" by default. */
  readonly label?: string
  readonly myId: string | undefined
  /** The viewer's roles in this server, for highlighting role mentions. */
  readonly myRoleIds: readonly string[]
  readonly canModerate: boolean
  readonly canReply: boolean
  readonly onReply: (message: Item) => void
  readonly canReact: boolean
  readonly canPin: boolean
  readonly onTogglePin: (message: Item) => void
  readonly onToggleReaction: (message: Item, emoji: string) => void
  readonly authorColor?: (userId: string) => string | undefined
  readonly editingId: string | null
  readonly onStartEdit: (message: Item) => void
  readonly onCancelEdit: () => void
  readonly onSaveEdit: (message: Item, content: string) => void
  readonly onDelete: (message: Item, skipConfirm: boolean) => void
  readonly onRetry: (message: Item) => void
  readonly onDiscard: (message: Item) => void
  /** An encrypted conversation: messages are decrypted on this device before showing. */
  readonly encryption?: EncryptedChannel | undefined
  /** Whether the viewer may edit their own messages (not yet in encrypted conversations). */
  readonly canEditOwn?: boolean
}

const ChannelStart = ({ name }: { name: string }) => {
  const { t } = useTranslation()
  return (
    <div className="px-4 pt-8 pb-4">
      <div className="mb-2 flex size-16 items-center justify-center rounded-full bg-elevated">
        <Hash aria-hidden className="size-9" />
      </div>
      <h2 className="text-3xl font-bold">{t('guild.welcomeTitle', { name })}</h2>
      <p className="text-muted">{t('guild.welcomeText', { name })}</p>
    </div>
  )
}

/**
 * History, newest at the bottom. The scroller is `flex-col-reverse`, so the browser keeps the
 * view pinned to the newest message and loading older pages above does not move the view.
 */
export const MessageList = ({
  channel,
  people,
  start,
  label,
  myId,
  myRoleIds,
  canModerate,
  canReply,
  canReact,
  canPin,
  authorColor,
  editingId,
  encryption,
  canEditOwn = true,
  ...handlers
}: MessageListProps) => {
  const [reporting, setReporting] = useState<string | null>(null)
  const [startingThread, setStartingThread] = useState<Item | null>(null)
  const { data: guild } = useQuery({
    ...guildQueryOptions(useApi(), channel.guildId ?? ''),
    enabled: channel.guildId !== null,
  })
  // Threads by the message they started from; new ones can start only in text channels.
  const threads = new Map(
    (guild?.channels ?? []).flatMap((c) =>
      c.type === 'thread' && c.threadStarterId ? [[c.threadStarterId, c] as const] : [],
    ),
  )
  const canStartThreads = channel.type === 'text' && canReply
  const announcement = guild?.channels.find((c) => c.id === channel.id)?.announcement ?? false
  const publish = usePublishMessage(channel.id)
  /** Authors publish their own announcements; moderators publish anyone's. */
  const mayPublish = (message: Item) =>
    announcement &&
    !message.pending &&
    !message.published &&
    message.content.trim() !== '' &&
    (message.author?.id === myId ? canReply : canModerate)
  const customEmojis =
    guild && guild.emojis.length > 0 ? { title: guild.name, emojis: guild.emojis } : null
  const { t, i18n } = useTranslation()
  const api = useApi()
  const history = useInfiniteQuery(messagesQueryOptions(api, channel.id))
  const { data: members } = useQuery({
    ...membersQueryOptions(api, channel.guildId ?? ''),
    enabled: channel.guildId !== null,
  })
  const nicknames = new Map(
    (members ?? []).flatMap((m) => (m.nickname ? [[m.user.id, m.nickname] as const] : [])),
  )
  const messages = useDecryptedMessages(encryption, flattenPages(history.data))
  const sentinel = useRef<HTMLDivElement>(null)
  useAckLatest(channel.id, messages.at(-1)?.id)
  const window_ = useRenderWindow(channel.id, groupMessages(messages))
  const { hidden, showOlder, shrink } = window_

  // Older rows: first the loaded ones outside the window, then more history.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history
  const hasOlder = hidden > 0 || Boolean(hasNextPage)
  const unread = useUnreadMarker(channel.id, messages, myId, Boolean(hasNextPage))
  const loadOlder = useCallback(() => {
    if (hidden > 0) {
      showOlder()
    } else if (!isFetchingNextPage) {
      // The page about to arrive goes straight into view.
      showOlder()
      void fetchNextPage()
    }
  }, [hidden, showOlder, isFetchingNextPage, fetchNextPage])
  useEffect(() => {
    const element = sentinel.current
    if (!element || typeof IntersectionObserver === 'undefined' || !hasOlder) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadOlder()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasOlder, loadOlder])

  if (history.isPending) {
    return (
      <p className="flex flex-1 items-center justify-center text-muted">{t('messages.loading')}</p>
    )
  }
  if (history.isError) {
    return (
      <p role="alert" className="flex flex-1 items-center justify-center text-red-400">
        {t('messages.loadError')}
      </p>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <UnreadBanner channelId={channel.id} marker={unread} />
      <div
        className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto"
        // Back at the newest messages (the bottom of a reversed scroller is 0): drop old rows.
        onScroll={(event) => {
          if (Math.abs(event.currentTarget.scrollTop) < 64) shrink()
        }}
      >
        <div>
          {hasOlder ? (
            <div ref={sentinel} className="flex justify-center py-3">
              <Button variant="link" pending={isFetchingNextPage} onClick={loadOlder}>
                {t('messages.loadOlder')}
              </Button>
            </div>
          ) : (
            (start ?? <ChannelStart name={channel.name} />)
          )}

          <MentionResolverProvider guildId={channel.guildId} people={people}>
            <ol
              aria-label={label ?? t('messages.listLabel', { name: channel.name })}
              className="pb-2"
            >
              {window_.rows.map((row) =>
                row.kind === 'day' ? (
                  <li key={`day-${row.day}`}>
                    <div
                      role="separator"
                      className="mx-4 my-4 flex items-center gap-2 text-xs font-semibold text-muted"
                    >
                      <span className="h-px flex-1 bg-border" />
                      {formatDay(row.day, i18n.language)}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  </li>
                ) : row.message.notice ? (
                  <li key={row.message.id} className="px-4 py-1 text-sm text-muted italic">
                    {row.message.notice}
                  </li>
                ) : row.message.system ? (
                  <SystemMessage key={row.message.id} message={row.message} />
                ) : (
                  <Fragment
                    key={
                      row.message.nonce && row.message.pending ? row.message.nonce : row.message.id
                    }
                  >
                    {row.message.id === unread.firstUnreadId ? (
                      <li>
                        <div
                          role="separator"
                          aria-label={t('unread.marker')}
                          className="mx-4 my-2 flex items-center gap-2 text-xs font-semibold text-danger"
                        >
                          <span className="h-px flex-1 bg-danger" />
                          {t('unread.markerShort')}
                        </div>
                      </li>
                    ) : null}
                    <MessageItem
                      guildId={channel.guildId}
                      authorNickname={
                        row.message.author ? nicknames.get(row.message.author.id) : undefined
                      }
                      message={row.message}
                      // The unread marker starts a new group.
                      compact={row.compact && row.message.id !== unread.firstUnreadId}
                      mentioned={myId !== undefined && mentionsMe(row.message, myId, myRoleIds)}
                      canEdit={canEditOwn && row.message.author?.id === myId}
                      canDelete={row.message.author?.id === myId || canModerate}
                      canReply={canReply}
                      onReply={() => handlers.onReply(row.message)}
                      canReact={canReact}
                      canPin={canPin}
                      onTogglePin={() => handlers.onTogglePin(row.message)}
                      onToggleReaction={(emoji) => handlers.onToggleReaction(row.message, emoji)}
                      authorColor={
                        row.message.author ? authorColor?.(row.message.author.id) : undefined
                      }
                      editing={editingId === row.message.id}
                      onStartEdit={() => handlers.onStartEdit(row.message)}
                      onCancelEdit={handlers.onCancelEdit}
                      onSaveEdit={(content) => handlers.onSaveEdit(row.message, content)}
                      onDelete={(skip) => handlers.onDelete(row.message, skip)}
                      onRetry={() => handlers.onRetry(row.message)}
                      onDiscard={() => handlers.onDiscard(row.message)}
                      thread={row.message.pending ? undefined : threads.get(row.message.id)}
                      customEmojis={customEmojis}
                      onPublish={
                        mayPublish(row.message) ? () => publish.mutate(row.message.id) : undefined
                      }
                      onStartThread={
                        canStartThreads && !row.message.pending && !threads.has(row.message.id)
                          ? () => setStartingThread(row.message)
                          : undefined
                      }
                      onReport={
                        // Not in encrypted conversations: a report would reach moderators empty.
                        !encryption &&
                        row.message.author &&
                        row.message.author.id !== myId &&
                        !row.message.pending
                          ? () => setReporting(row.message.id)
                          : undefined
                      }
                    />
                  </Fragment>
                ),
              )}
            </ol>
          </MentionResolverProvider>
        </div>
        {startingThread && channel.guildId ? (
          <CreateThreadDialog
            guildId={channel.guildId}
            channelId={channel.id}
            messageId={startingThread.id}
            content={startingThread.content}
            onClose={() => setStartingThread(null)}
          />
        ) : null}
        {reporting ? (
          <ReportDialog
            channelId={channel.id}
            messageId={reporting}
            onClose={() => setReporting(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
