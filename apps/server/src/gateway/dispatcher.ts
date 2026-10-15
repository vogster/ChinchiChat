import type { EventBus, SequencedEvent } from '../events/event-bus'

export interface Subscriber {
  deliver(event: SequencedEvent): void
}

/** Routes bus events to the local connections subscribed to each topic. */
export const createDispatcher = (events: EventBus) => {
  const byTopic = new Map<string, Set<Subscriber>>()

  const stop = events.onEvent((event) => {
    for (const subscriber of byTopic.get(event.topic) ?? []) subscriber.deliver(event)
  })

  return {
    subscribe(subscriber: Subscriber, topic: string) {
      const set = byTopic.get(topic) ?? new Set()
      set.add(subscriber)
      byTopic.set(topic, set)
    },

    unsubscribe(subscriber: Subscriber, topic: string) {
      const set = byTopic.get(topic)
      set?.delete(subscriber)
      if (set?.size === 0) byTopic.delete(topic)
    },

    close() {
      stop()
      byTopic.clear()
    },
  }
}

export type Dispatcher = ReturnType<typeof createDispatcher>
