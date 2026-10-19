import { Link } from '@tanstack/react-router'
import { ChevronDown, Megaphone, MessagesSquare, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { dropTargetClass } from '../../lib/use-drag-sort'
import { formatMentionCount } from '../messages/mentions'
import { VoiceChannelRow } from '../voice/voice-channel-row'

import type { DragItemProps } from '../../lib/use-drag-sort'
import type { Channel } from '@chinchi/shared'

/** A channel or thread link: muted text, a soft accent when open, bold when unread. */
const linkState =
  'transition-colors hover:bg-field hover:text-text data-[muted=true]:opacity-50 data-[status=active]:bg-accent-soft data-[status=active]:text-accent-text data-[unread=true]:font-semibold data-[unread=true]:text-text'

const sideButton =
  'grid shrink-0 place-items-center rounded-full text-faint hover:bg-chip hover:text-text'

/**
 * The name with its unread marks: plain unread as a dot right after the name, unread mentions
 * as an accent count at the row's end.
 */
const NameWithMarks = ({
  name,
  unread,
  mentions,
}: {
  name: string
  unread: boolean
  mentions: number
}) => (
  <>
    <span className="min-w-0 truncate">{name}</span>
    {unread && mentions === 0 ? (
      <span aria-hidden className="-ml-1 size-2 shrink-0 rounded-full bg-accent" />
    ) : null}
    <span className="flex-1" />
    {mentions > 0 ? (
      <span
        aria-hidden
        className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-contrast"
      >
        {formatMentionCount(mentions)}
      </span>
    ) : null}
  </>
)

/** Threads hang off their channel on a drawn branch: a rounded elbow, and a line to the next. */
const ThreadBranch = ({
  threads,
  isUnread,
}: {
  threads: readonly Channel[]
  isUnread: (channel: Channel) => boolean
}) => (
  <ul className="mt-px mb-[3px] flex flex-col">
    {threads.map((thread, index) => (
      <li key={thread.id} className="relative pl-[33px]">
        {index < threads.length - 1 ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-[19px] border-l-[1.5px] border-chip"
          />
        ) : null}
        <span
          aria-hidden
          className="absolute -top-0.5 left-[19px] h-[18px] w-2.5 rounded-bl-[10px] border-b-[1.5px] border-l-[1.5px] border-chip"
        />
        <Link
          to="/channels/$guildId/$channelId"
          params={{ guildId: thread.guildId, channelId: thread.id }}
          data-unread={isUnread(thread)}
          className={`flex h-8 items-center gap-2 rounded-xl px-2.5 text-[13.5px] text-muted ${linkState}`}
        >
          <MessagesSquare aria-hidden className="size-3.5 shrink-0" />
          <NameWithMarks name={thread.name} unread={isUnread(thread)} mentions={0} />
        </Link>
      </li>
    ))}
  </ul>
)

export interface ChannelRowProps {
  readonly channel: Channel
  /** The channel's threads, listed under it. */
  readonly threads: readonly Channel[]
  readonly isUnread: (channel: Channel) => boolean
  readonly canManage: boolean
  readonly unread: boolean
  readonly muted: boolean
  readonly mentions: number
  /** Threads (text) or the people inside (voice) are folded away. */
  readonly folded: boolean
  readonly onToggleFolded: () => void
  readonly onEdit: (channel: Channel) => void
  readonly dragProps: DragItemProps
}

export const ChannelRow = ({
  channel,
  threads,
  isUnread,
  canManage,
  unread,
  muted,
  mentions,
  folded,
  onToggleFolded,
  onEdit,
  dragProps,
}: ChannelRowProps) => {
  const { t } = useTranslation()
  const states = [
    muted ? t('notifications.mutedState') : null,
    unread ? t('messages.unread') : null,
    mentions > 0 ? t('messages.mentionCount', { count: mentions }) : null,
  ].filter(Boolean)
  const editButton = canManage ? (
    <button
      type="button"
      aria-label={t('guild.editChannel', { name: channel.name })}
      onClick={() => onEdit(channel)}
      className={`${sideButton} size-6 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100`}
    >
      <Settings aria-hidden className="size-3.5" />
    </button>
  ) : null

  if (channel.type === 'voice') {
    return (
      <VoiceChannelRow
        channel={channel}
        editButton={editButton}
        dragProps={dragProps}
        unfolded={!folded}
        onToggleUnfolded={onToggleFolded}
      />
    )
  }

  const hasThreads = threads.length > 0
  return (
    <li {...dragProps} className={`group relative ${dropTargetClass}`}>
      <Link
        to="/channels/$guildId/$channelId"
        params={{ guildId: channel.guildId, channelId: channel.id }}
        data-unread={unread}
        data-muted={muted}
        aria-label={states.length > 0 ? `${channel.name} (${states.join(', ')})` : undefined}
        className={`flex h-[38px] items-center gap-2.5 rounded-field px-3 text-muted max-md:h-12 max-md:rounded-tile ${linkState} ${editButton || hasThreads ? 'pr-16' : ''}`}
      >
        {channel.announcement ? (
          <Megaphone aria-hidden className="size-4 shrink-0 text-faint" />
        ) : (
          // Drawn by CSS, so "#" stays out of the link's text.
          <span
            aria-hidden
            className="w-4 shrink-0 text-center font-medium text-faint before:content-['#']"
          />
        )}
        <NameWithMarks name={channel.name} unread={unread} mentions={mentions} />
      </Link>
      <span className="absolute top-[7px] right-1.5 flex items-center gap-0.5">
        {editButton}
        {hasThreads ? (
          <button
            type="button"
            aria-expanded={!folded}
            aria-label={
              folded
                ? t('threads.unfold', { name: channel.name, count: threads.length })
                : t('threads.fold', { name: channel.name })
            }
            onClick={onToggleFolded}
            // A pill of count and chevron in one line ("2 ›" folded), as in the design.
            className="flex h-6 shrink-0 items-center gap-[3px] rounded-full pr-1.5 pl-[7px] text-[11px] font-medium text-faint transition-colors hover:bg-chip hover:text-text"
          >
            {folded ? <span>{threads.length}</span> : null}
            <ChevronDown
              aria-hidden
              strokeWidth={2.4}
              className={`size-3.5 transition-transform duration-200 ${folded ? '-rotate-90' : ''}`}
            />
          </button>
        ) : null}
      </span>
      {hasThreads && !folded ? <ThreadBranch threads={threads} isUnread={isUnread} /> : null}
    </li>
  )
}
