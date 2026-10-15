/**
 * Realtime fan-out. Services publish to topics; gateway connections listen to the topics they
 * may see: `guild:<id>` for everything in a server, `user:<id>` for one account's devices.
 *
 * Every event gets a sequence number that is monotonic across the whole instance. Clients
 * remember the last one they saw and, after a dropped connection, replay what they missed.
 */
export interface BusEvent<T = unknown> {
  readonly topic: string
  readonly type: string
  readonly data: T
}

export interface SequencedEvent<T = unknown> extends BusEvent<T> {
  readonly seq: number
}

export type EventListener = (event: SequencedEvent) => void

export interface EventBus {
  /** Publishes and resolves with the event's sequence number. */
  publish(event: BusEvent): Promise<number>
  /** Live events from every server process, in sequence order. */
  onEvent(listener: EventListener): () => void
  /** Events after `seq`, or null when part of that history is no longer retained. */
  replay(afterSeq: number): Promise<SequencedEvent[] | null>
  /** Sequence number of the newest event (0 when there is none). */
  latestSeq(): Promise<number>
  close(): Promise<void>
}

export const guildTopic = (guildId: string) => `guild:${guildId}`
export const userTopic = (userId: string) => `user:${userId}`

export interface MemoryEventBusOptions {
  /** How many recent events are kept for replay. */
  readonly retain?: number
}

/** Single-process bus; also records everything published, which tests assert on. */
export const createMemoryEventBus = ({ retain = 10_000 }: MemoryEventBusOptions = {}) => {
  const listeners = new Set<EventListener>()
  const published: BusEvent[] = []
  let history: SequencedEvent[] = []
  let seq = 0
  // Sequence number of the newest event that fell out of the history.
  let trimmedUpTo = 0

  const bus: EventBus & { readonly published: readonly BusEvent[]; clear(): void } = {
    published,
    async publish(event) {
      seq += 1
      const sequenced = { ...event, seq }
      published.push(event)
      history = [...history, sequenced]
      if (history.length > retain) {
        trimmedUpTo = history[history.length - retain - 1]?.seq ?? trimmedUpTo
        history = history.slice(-retain)
      }
      for (const listener of listeners) listener(sequenced)
      return seq
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async replay(afterSeq) {
      if (afterSeq < trimmedUpTo) return null
      return history.filter((event) => event.seq > afterSeq)
    },
    async latestSeq() {
      return seq
    },
    async close() {
      listeners.clear()
    },
    clear() {
      published.splice(0)
    },
  }
  return bus
}

export type MemoryEventBus = ReturnType<typeof createMemoryEventBus>
