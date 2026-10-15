import type { Snowflake } from '@chinchi/shared'

/** How long a TYPING_START keeps someone "typing" without a new one. */
export const TYPING_TTL_MS = 9000

type Listener = () => void

/**
 * Who is typing where. Ephemeral and timer-driven, so it lives outside the query cache.
 * Snapshots are immutable so React can compare them by reference.
 */
export const createTypingStore = (now: () => number = Date.now) => {
  let typing: Readonly<Record<Snowflake, Readonly<Record<Snowflake, number>>>> = {}
  const listeners = new Set<Listener>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const stop = (channelId: Snowflake, userId: Snowflake) => {
    const users = typing[channelId]
    if (!users?.[userId]) return
    const { [userId]: _removed, ...rest } = users
    typing = { ...typing, [channelId]: rest }
    const key = `${channelId}:${userId}`
    clearTimeout(timers.get(key))
    timers.delete(key)
    emit()
  }

  return {
    start(channelId: Snowflake, userId: Snowflake) {
      const key = `${channelId}:${userId}`
      clearTimeout(timers.get(key))
      timers.set(
        key,
        setTimeout(() => stop(channelId, userId), TYPING_TTL_MS),
      )
      typing = { ...typing, [channelId]: { ...typing[channelId], [userId]: now() + TYPING_TTL_MS } }
      emit()
    },
    stop,
    /** User ids typing in a channel, in the order they started. */
    typingIn(channelId: Snowflake): readonly Snowflake[] {
      return Object.keys(typing[channelId] ?? {})
    },
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => typing,
  }
}

export type TypingStore = ReturnType<typeof createTypingStore>
