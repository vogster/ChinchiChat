import type { Channel } from '@chinchi/shared'

export interface CategoryNode {
  readonly category: Channel
  readonly channels: readonly Channel[]
}

export interface ChannelTree {
  /** Channels outside any category, shown above the categories (as in Discord). */
  readonly uncategorized: readonly Channel[]
  readonly categories: readonly CategoryNode[]
}

const byPosition = (a: Channel, b: Channel) =>
  a.position - b.position ||
  (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)

export const buildChannelTree = (channels: readonly Channel[]): ChannelTree => {
  const categories = channels.filter((c) => c.type === 'category').toSorted(byPosition)
  const categoryIds = new Set(categories.map((c) => c.id))
  // Threads hang under their text channel, not in the tree itself.
  const children = channels.filter((c) => c.type !== 'category' && c.type !== 'thread')

  return {
    uncategorized: children
      .filter((c) => c.parentId === null || !categoryIds.has(c.parentId))
      .toSorted(byPosition),
    categories: categories.map((category) => ({
      category,
      channels: children.filter((c) => c.parentId === category.id).toSorted(byPosition),
    })),
  }
}

/** A text channel's threads, newest first. */
export const threadsOf = (channels: readonly Channel[], parentId: string): Channel[] =>
  channels
    .filter((c) => c.type === 'thread' && c.parentId === parentId)
    .toSorted((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1))

/** The text channel a user lands on when opening a server. */
export const firstTextChannel = (channels: readonly Channel[]): Channel | undefined => {
  const tree = buildChannelTree(channels)
  return [...tree.uncategorized, ...tree.categories.flatMap((node) => node.channels)].find(
    (c) => c.type === 'text',
  )
}
