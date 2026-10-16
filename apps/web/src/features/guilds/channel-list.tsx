import { Link } from '@tanstack/react-router'
import { ChevronDown, Hash, Megaphone, MessagesSquare, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dropTargetClass, useDragSort } from '../../lib/use-drag-sort'
import { formatMentionCount } from '../messages/mentions'
import { VoiceChannelRow } from '../voice/voice-channel-row'
import { buildChannelTree, threadsOf } from './channel-tree'

import type { DragItemProps } from '../../lib/use-drag-sort'
import type { ChannelDrop } from './channel-order'
import type { Channel } from '@chinchi/shared'

export interface ChannelListProps {
  readonly channels: readonly Channel[]
  readonly isUnread: (channel: Channel) => boolean
  /** Muted for the viewer: dimmed, without an unread marker. */
  readonly isMuted: (channel: Channel) => boolean
  /** Unread mentions of the viewer in the channel. */
  readonly mentionCount: (channel: Channel) => number
  /** May create channels (the "+" next to categories). */
  readonly canCreate: boolean
  /** May open a channel's settings. */
  readonly canManage: (channel: Channel) => boolean
  readonly onCreateIn: (category: Channel) => void
  readonly onEdit: (channel: Channel) => void
  /** May reorder channels (drag and drop, Alt+arrows). */
  readonly canReorder: boolean
  readonly onMove: (channelId: string, drop: ChannelDrop) => void
}

const rowClass =
  'group flex items-center gap-1.5 rounded px-2 py-1.5 text-muted hover:bg-hover hover:text-text'

interface ChannelRowProps {
  readonly channel: Channel
  /** The channel's threads, listed under it. */
  readonly threads: readonly Channel[]
  readonly isUnread: (channel: Channel) => boolean
  readonly canManage: boolean
  readonly unread: boolean
  readonly muted: boolean
  readonly mentions: number
  readonly onEdit: (channel: Channel) => void
  readonly dragProps: DragItemProps
}

const ChannelRow = ({
  channel,
  threads,
  isUnread,
  canManage,
  unread,
  muted,
  mentions,
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
      className="ml-auto rounded p-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-text"
    >
      <Settings aria-hidden className="size-3.5" />
    </button>
  ) : null

  if (channel.type === 'voice') {
    return <VoiceChannelRow channel={channel} editButton={editButton} dragProps={dragProps} />
  }

  return (
    <li {...dragProps} className={`group relative ${dropTargetClass}`}>
      {unread ? (
        <span
          aria-hidden
          className="absolute top-1/2 -left-2 h-2 w-1 -translate-y-1/2 rounded-r bg-text"
        />
      ) : null}
      <Link
        to="/channels/$guildId/$channelId"
        params={{ guildId: channel.guildId, channelId: channel.id }}
        data-unread={unread}
        data-muted={muted}
        aria-label={states.length > 0 ? `${channel.name} (${states.join(', ')})` : undefined}
        className={`${rowClass} pr-7 data-[muted=true]:opacity-50 data-[status=active]:bg-hover data-[status=active]:text-text data-[unread=true]:font-semibold data-[unread=true]:text-text`}
      >
        {channel.announcement ? (
          <Megaphone aria-hidden className="size-4 shrink-0" />
        ) : (
          <Hash aria-hidden className="size-4 shrink-0" />
        )}
        <span className="truncate">{channel.name}</span>
        {mentions > 0 ? (
          <span
            aria-hidden
            className="ml-auto rounded-full bg-danger px-1.5 text-xs leading-4 font-bold text-danger-contrast"
          >
            {formatMentionCount(mentions)}
          </span>
        ) : null}
      </Link>
      {editButton ? <span className="absolute top-2 right-2">{editButton}</span> : null}
      {threads.length > 0 ? (
        <ul className="mt-0.5 flex flex-col gap-0.5 pl-5">
          {threads.map((thread) => (
            <li key={thread.id}>
              <Link
                to="/channels/$guildId/$channelId"
                params={{ guildId: thread.guildId, channelId: thread.id }}
                data-unread={isUnread(thread)}
                className={`${rowClass} py-1 text-sm data-[status=active]:bg-hover data-[status=active]:text-text data-[unread=true]:font-semibold data-[unread=true]:text-text`}
              >
                <MessagesSquare aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{thread.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export const ChannelList = ({
  channels,
  isUnread,
  isMuted,
  mentionCount,
  canCreate,
  canManage,
  onCreateIn,
  onEdit,
  canReorder,
  onMove,
}: ChannelListProps) => {
  const { t } = useTranslation()
  const tree = buildChannelTree(channels)
  const categoryIds = new Set(tree.categories.map((node) => node.category.id))
  const sort = useDragSort({
    onDrop: (draggedId, targetId) =>
      onMove(
        draggedId,
        categoryIds.has(targetId) ? { categoryId: targetId } : { channelId: targetId },
      ),
    onStep: (id, step) => {
      // One place up or down within the item's own list.
      const lists = [
        tree.categories.map((node) => node.category),
        tree.uncategorized,
        ...tree.categories.map((node) => node.channels),
      ]
      const list = lists.find((l) => l.some((c) => c.id === id)) ?? []
      const neighbour = list[list.findIndex((c) => c.id === id) + step]
      if (!neighbour) return
      onMove(id, categoryIds.has(id) ? { categoryId: neighbour.id } : { channelId: neighbour.id })
    },
  })
  const dragProps = (id: string) => sort.itemProps(id, { draggable: canReorder })
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const row = (channel: Channel) => (
    <ChannelRow
      key={channel.id}
      channel={channel}
      threads={channel.type === 'text' ? threadsOf(channels, channel.id) : []}
      isUnread={isUnread}
      canManage={canManage(channel)}
      unread={isUnread(channel)}
      muted={isMuted(channel)}
      mentions={mentionCount(channel)}
      onEdit={onEdit}
      dragProps={dragProps(channel.id)}
    />
  )

  return (
    <nav aria-label={t('guild.channelsLabel')} className="flex-1 overflow-y-auto px-2 py-3">
      <ul className="flex flex-col gap-0.5">{tree.uncategorized.map(row)}</ul>

      {tree.categories.map(({ category, channels: children }) => {
        const isCollapsed = collapsed.has(category.id)
        // A collapsed category still shows its unread channels, as in Discord.
        const visible = isCollapsed
          ? children.filter((child) => isUnread(child) || mentionCount(child) > 0)
          : children
        return (
          <section
            key={category.id}
            {...dragProps(category.id)}
            className={`mt-4 ${dropTargetClass}`}
          >
            <div className="group flex items-center pr-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(category.id)}
                className="flex flex-1 items-center gap-0.5 text-xs font-bold tracking-wide text-muted uppercase hover:text-text"
              >
                <ChevronDown
                  aria-hidden
                  className={`size-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                />
                <span className="truncate">{category.name}</span>
              </button>
              {canManage(category) ? (
                <button
                  type="button"
                  aria-label={t('guild.editChannel', { name: category.name })}
                  onClick={() => onEdit(category)}
                  className="rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-text focus:opacity-100"
                >
                  <Settings aria-hidden className="size-3.5" />
                </button>
              ) : null}
              {canCreate ? (
                <button
                  type="button"
                  aria-label={t('guild.addChannelTo', { name: category.name })}
                  onClick={() => onCreateIn(category)}
                  className="rounded p-0.5 text-muted hover:text-text"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            {visible.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5">{visible.map(row)}</ul>
            ) : null}
          </section>
        )
      })}
    </nav>
  )
}
