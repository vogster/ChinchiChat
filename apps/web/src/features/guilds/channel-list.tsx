import { ChevronDown, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { dropTargetClass, useDragSort } from '../../lib/use-drag-sort'
import { ChannelRow } from './channel-row'
import { buildChannelTree, threadsOf } from './channel-tree'

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
  // Channels whose fold differs from the default: threads start unfolded, voice cards folded.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set())

  const toggleIn =
    (setter: typeof setCollapsed) =>
    (id: string): void =>
      setter((current) => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
  const toggle = toggleIn(setCollapsed)
  const flip = toggleIn(setFlipped)
  const isFolded = (channel: Channel) =>
    channel.type === 'voice' ? !flipped.has(channel.id) : flipped.has(channel.id)

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
      folded={isFolded(channel)}
      onToggleFolded={() => flip(channel.id)}
      onEdit={onEdit}
      dragProps={dragProps(channel.id)}
    />
  )

  return (
    <nav aria-label={t('guild.channelsLabel')} className="flex-1 overflow-y-auto px-2.5 pb-3">
      <ul className="flex flex-col gap-[3px]">{tree.uncategorized.map(row)}</ul>

      {tree.categories.map(({ category, channels: children }) => {
        const isCollapsed = collapsed.has(category.id)
        // A collapsed category still shows its unread channels, as in Discord.
        const visible = isCollapsed
          ? children.filter((child) => isUnread(child) || mentionCount(child) > 0)
          : children
        return (
          <section key={category.id} {...dragProps(category.id)} className={dropTargetClass}>
            <div className="group flex items-center gap-0.5 px-2.5 pt-3.5 pb-1.5">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(category.id)}
                className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] font-medium text-faint hover:text-text"
              >
                <span className="truncate">{category.name}</span>
                <ChevronDown
                  aria-hidden
                  className={`size-3 shrink-0 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
              {canManage(category) ? (
                <button
                  type="button"
                  aria-label={t('guild.editChannel', { name: category.name })}
                  onClick={() => onEdit(category)}
                  className="grid size-6 place-items-center rounded-full text-faint opacity-0 group-hover:opacity-100 hover:bg-chip hover:text-text focus:opacity-100"
                >
                  <Settings aria-hidden className="size-3.5" />
                </button>
              ) : null}
              {canCreate ? (
                <button
                  type="button"
                  aria-label={t('guild.addChannelTo', { name: category.name })}
                  onClick={() => onCreateIn(category)}
                  className="grid size-6 place-items-center rounded-full text-faint hover:bg-chip hover:text-text"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
            {visible.length > 0 ? (
              <ul className="flex flex-col gap-[3px]">{visible.map(row)}</ul>
            ) : null}
          </section>
        )
      })}
    </nav>
  )
}
