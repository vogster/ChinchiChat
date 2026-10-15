import type { Reaction } from '@chinchi/shared'

/** Offered in the toolbar until there is a full emoji picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const

export interface ReactionChange {
  readonly emoji: string
  readonly add: boolean
  /** The change is the viewer's own (from a click or its echo from the gateway). */
  readonly mine: boolean
}

/**
 * Applies one add/remove to a message's reactions. Idempotent for the viewer's own changes:
 * the gateway echo of an optimistic update finds it already applied and changes nothing.
 */
export const withReaction = (
  reactions: readonly Reaction[],
  { emoji, add, mine }: ReactionChange,
): Reaction[] => {
  const existing = reactions.find((reaction) => reaction.emoji === emoji)
  if (add) {
    if (!existing) return [...reactions, { emoji, count: 1, me: mine }]
    if (mine && existing.me) return [...reactions]
    return reactions.map((reaction) =>
      reaction === existing
        ? { ...reaction, count: reaction.count + 1, me: reaction.me || mine }
        : reaction,
    )
  }
  if (!existing || (mine && !existing.me)) return [...reactions]
  return reactions.flatMap((reaction) => {
    if (reaction !== existing) return [reaction]
    const count = reaction.count - 1
    return count > 0 ? [{ ...reaction, count, me: mine ? false : reaction.me }] : []
  })
}
