import { buildChannelTree } from './channel-tree'

import type { Channel, ReorderChannelsRequest } from '@chinchi/shared'

type ReorderItem = ReorderChannelsRequest[number]

/** Where a dragged channel lands: on another channel's row, or on a category's header. */
export type ChannelDrop = { readonly channelId: string } | { readonly categoryId: string }

/** The channels sharing a list with `parentId` (null = outside categories), in sidebar order. */
const siblingsIn = (channels: readonly Channel[], parentId: string | null): readonly Channel[] => {
  const tree = buildChannelTree(channels)
  if (parentId === null) return tree.uncategorized
  return tree.categories.find((node) => node.category.id === parentId)?.channels ?? []
}

/** Numbers the list 0..n-1 and keeps only the entries whose place actually changed. */
const renumber = (order: readonly Channel[], moved: Channel, parentId: string | null) =>
  order.flatMap((item, position): ReorderItem[] => {
    const reparented = item.id === moved.id && moved.parentId !== parentId
    if (item.position === position && !reparented) return []
    return [{ id: item.id, position, ...(reparented ? { parentId } : {}) }]
  })

const insertAt = (list: readonly Channel[], index: number, item: Channel) => [
  ...list.slice(0, index),
  item,
  ...list.slice(index),
]

/**
 * The reorder request for dropping `draggedId`. Categories only move among categories; other
 * channels move within or between lists. Moving down lands after the target, moving up (or into
 * another list) lands before it, as in any sortable list. Returns [] when nothing would change.
 */
export const planChannelMove = (
  channels: readonly Channel[],
  draggedId: string,
  drop: ChannelDrop,
): ReorderItem[] => {
  const dragged = channels.find((c) => c.id === draggedId)
  if (!dragged || dragged.type === 'thread') return []
  const targetId = 'channelId' in drop ? drop.channelId : drop.categoryId
  const target = channels.find((c) => c.id === targetId)
  if (!target || target.id === dragged.id) return []

  if (dragged.type === 'category') {
    if (target.type !== 'category') return []
    return placeNear(
      buildChannelTree(channels).categories.map((n) => n.category),
      dragged,
      target,
      null,
    )
  }

  // Dropped on a header: the end of that category.
  if ('categoryId' in drop) {
    if (target.type !== 'category' || dragged.parentId === target.id) return []
    const list = siblingsIn(channels, target.id)
    return renumber([...list, dragged], dragged, target.id)
  }
  if (target.type === 'category' || target.type === 'thread') return []
  const parentId = siblingsIn(channels, target.parentId).includes(target) ? target.parentId : null
  return placeNear(siblingsIn(channels, parentId), dragged, target, parentId)
}

const placeNear = (
  list: readonly Channel[],
  dragged: Channel,
  target: Channel,
  parentId: string | null,
): ReorderItem[] => {
  const from = list.indexOf(dragged)
  const rest = list.filter((c) => c !== dragged)
  const targetIndex = rest.indexOf(target)
  const index = from !== -1 && from <= targetIndex ? targetIndex + 1 : targetIndex
  return renumber(insertAt(rest, index, dragged), dragged, parentId)
}

/** The channels with a reorder applied (for showing a move before the server confirms it). */
export const applyChannelOrder = (
  channels: readonly Channel[],
  items: readonly ReorderItem[],
): Channel[] => {
  const byId = new Map(items.map((item) => [item.id, item]))
  return channels.map((channel) => {
    const item = byId.get(channel.id)
    if (!item) return channel
    return {
      ...channel,
      position: item.position,
      ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
    }
  })
}
