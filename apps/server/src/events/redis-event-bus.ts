import type { BusEvent, EventBus, EventListener, SequencedEvent } from './event-bus'
import type { Redis } from 'ioredis'

export interface RedisEventBusOptions {
  /** Stream key shared by all server processes of one instance. */
  readonly stream?: string
  /** Events kept for resuming sessions. */
  readonly maxLength?: number
}

/**
 * Stream ids look like `<ms>-<n>`. Encoding them as ms * 1000 + n gives a plain number that
 * stays monotonic across all sessions and processes (n stays far below 1000 per millisecond at
 * our scale; a single process cannot publish 1000 events within one millisecond).
 */
const SEQ_FACTOR = 1000
export const streamIdToSeq = (id: string): number => {
  const [ms, n] = id.split('-')
  return Number(ms) * SEQ_FACTOR + Number(n)
}
export const seqToStreamId = (seq: number): string =>
  `${Math.floor(seq / SEQ_FACTOR)}-${seq % SEQ_FACTOR}`

const parseEntry = (id: string, fields: string[]): SequencedEvent => {
  const values = new Map<string, string>()
  for (let i = 0; i + 1 < fields.length; i += 2)
    values.set(fields[i] as string, fields[i + 1] as string)
  return {
    topic: values.get('topic') ?? '',
    type: values.get('type') ?? '',
    data: JSON.parse(values.get('data') ?? 'null') as unknown,
    seq: streamIdToSeq(id),
  }
}

interface StreamInfo {
  readonly lastGeneratedSeq: number
  readonly firstSeq: number | null
  /** True once MAXLEN trimming has dropped entries. */
  readonly trimmed: boolean
}

/** Reads the `XINFO STREAM` fields we need; a missing stream is an empty one. */
const streamInfo = async (redis: Redis, stream: string): Promise<StreamInfo> => {
  try {
    const raw = (await redis.xinfo('STREAM', stream)) as unknown[]
    const info = new Map<string, unknown>()
    for (let i = 0; i + 1 < raw.length; i += 2) info.set(String(raw[i]), raw[i + 1])
    const first = info.get('first-entry') as [string, string[]] | null | undefined
    return {
      lastGeneratedSeq: streamIdToSeq(String(info.get('last-generated-id') ?? '0-0')),
      firstSeq: first ? streamIdToSeq(first[0]) : null,
      trimmed: Number(info.get('entries-added') ?? 0) > Number(info.get('length') ?? 0),
    }
  } catch {
    return { lastGeneratedSeq: 0, firstSeq: null, trimmed: false }
  }
}

/** Instance-wide event bus on a Valkey/Redis stream: fan-out across processes plus replay. */
export const createRedisEventBus = async (
  redis: Redis,
  { stream = 'chinchi:events', maxLength = 10_000 }: RedisEventBusOptions = {},
): Promise<EventBus> => {
  const listeners = new Set<EventListener>()
  // Blocking reads need their own connection.
  const reader = redis.duplicate()
  let closed = false
  let lastId = seqToStreamId((await streamInfo(redis, stream)).lastGeneratedSeq)

  const readLoop = async () => {
    while (!closed) {
      try {
        const result = await reader.xread('COUNT', 100, 'BLOCK', 2000, 'STREAMS', stream, lastId)
        for (const [, entries] of result ?? []) {
          for (const [id, fields] of entries) {
            lastId = id
            const event = parseEntry(id, fields)
            for (const listener of listeners) listener(event)
          }
        }
      } catch {
        if (closed) return
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }
  void readLoop()

  return {
    async publish({ topic, type, data }: BusEvent) {
      const id = await redis.xadd(
        stream,
        'MAXLEN',
        maxLength,
        '*',
        'topic',
        topic,
        'type',
        type,
        'data',
        JSON.stringify(data),
      )
      return streamIdToSeq(id as string)
    },
    onEvent(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async replay(afterSeq) {
      const { lastGeneratedSeq, firstSeq, trimmed } = await streamInfo(redis, stream)
      if (afterSeq >= lastGeneratedSeq) return []
      // Trimming does not record what it removed, so if the retained window no longer reaches
      // back to `afterSeq`, some missed events may be gone: the client must start over.
      if (trimmed && (firstSeq === null || afterSeq < firstSeq)) return null
      const entries = await redis.xrange(stream, `(${seqToStreamId(afterSeq)}`, '+')
      return entries.map(([id, fields]) => parseEntry(id, fields))
    },
    async latestSeq() {
      return (await streamInfo(redis, stream)).lastGeneratedSeq
    },
    async close() {
      closed = true
      listeners.clear()
      reader.disconnect()
    },
  }
}
