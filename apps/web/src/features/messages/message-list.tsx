import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { useDecryptedMessages } from '../e2ee/use-decrypted-messages'
import { guildQueryOptions, membersQueryOptions } from '../guilds/queries'
import { MentionResolverProvider } from '../markdown/mention-resolver-provider'
import { ReportDialog } from '../reports/report-dialog'
import { CreateThreadDialog } from '../threads/create-thread-dialog'
import { groupPosition } from './bubble-shape'
import { formatDay } from './format-time'
import { groupMessages } from './group-messages'
import { mentionsMe } from './mentions'
import { MessageItem } from './message-item'
import { flattenPages, messagesQueryOptions } from './queries'
import { SystemMessage } from './system-message'
import { UnreadBanner, UnreadLine } from './unread-banner'
import { useAckLatest, usePublishMessage } from './use-messages'
import { useRenderWindow } from './use-render-window'
import { useUnreadMarker } from './use-unread-marker'

import type { EncryptedChannel } from '../e2ee/client'
import type { MessageRow } from './group-messages'
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
    <div className="mx-5 mt-4 mb-5 flex items-center gap-4 rounded-card bg-stage p-5">
      <span
        aria-hidden
        className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-accent text-2xl font-semibold text-accent-contrast"
      >
        #
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          {t('guild.welcomeTitle', { name })}
        </h2>
        <p className="mt-0.5 text-pretty text-muted">{t('guild.welcomeText', { name })}</p>
      </div>
    </div>
  )
}

/** A message row continues its author's run when it is grouped and no marker splits it. */
const continuesRun = (row: MessageRow | undefined, firstUnreadId: string | null) =>
  row?.kind === 'message' &&
  row.compact &&
  !row.message.notice &&
  !row.message.system &&
  row.message.id !== firstUnreadId

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
              className="pb-3"
            >
              {window_.rows.map((row, index) =>
                row.kind === 'day' ? (
                  <li key={`day-${row.day}`} className="mt-2 mb-1 flex justify-center">
                    <div
                      role="separator"
                      className="rounded-xl bg-stage px-3 py-[5px] text-xs text-faint"
                    >
                      {formatDay(row.day, i18n.language)}
                    </div>
                  </li>
                ) : row.message.notice ? (
                  <li key={row.message.id} className="px-5 py-1 text-sm text-faint italic">
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
                      <UnreadLine onSeen={unread.hideBanner} />
                    ) : null}
                    <MessageItem
                      guildId={channel.guildId}
                      authorNickname={
                        row.message.author ? nicknames.get(row.message.author.id) : undefined
                      }
                      message={row.message}
                      // The unread marker starts a new group.
                      compact={row.compact && row.message.id !== unread.firstUnreadId}
                      position={groupPosition(
                        !continuesRun(row, unread.firstUnreadId),
                        !continuesRun(window_.rows[index + 1], unread.firstUnreadId),
                      )}
                      mine={myId !== undefined && row.message.author?.id === myId}
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
