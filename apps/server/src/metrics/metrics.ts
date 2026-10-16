import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client'

import type { EventBus } from '../events/event-bus'

/** Buckets for API latency: most requests take a few milliseconds, slow ones up to seconds. */
const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]

/**
 * The server's Prometheus metrics, in a registry of its own (not the library's global one),
 * so tests and several app instances in one process don't collide.
 */
export const createMetrics = () => {
  const registry = new Registry()
  collectDefaultMetrics({ register: registry })

  const httpDuration = new Histogram({
    name: 'chinchi_http_request_duration_seconds',
    help: 'HTTP request duration by route pattern and status',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: HTTP_BUCKETS,
    registers: [registry],
  })
  const gatewayConnections = new Gauge({
    name: 'chinchi_gateway_connections',
    help: 'Open gateway WebSocket connections on this process',
    registers: [registry],
  })
  const gatewayDispatches = new Counter({
    name: 'chinchi_gateway_dispatches_total',
    help: 'Events sent to gateway connections, by type',
    labelNames: ['type'] as const,
    registers: [registry],
  })
  const gatewayReady = new Histogram({
    name: 'chinchi_gateway_ready_seconds',
    help: 'Time from IDENTIFY to READY (permissions, session, presence, snapshot)',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  })
  const eventsPublished = new Counter({
    name: 'chinchi_events_published_total',
    help: 'Events published to the event bus, by type',
    labelNames: ['type'] as const,
    registers: [registry],
  })
  const jobs = new Counter({
    name: 'chinchi_background_jobs_total',
    help: 'Background jobs run, by kind and outcome',
    labelNames: ['kind', 'outcome'] as const,
    registers: [registry],
  })
  const rateLimitStoreErrors = new Counter({
    name: 'chinchi_rate_limit_store_errors_total',
    help: 'Rate-limit checks that failed because Valkey did not answer (fail-open routes ran unchecked)',
    registers: [registry],
  })

  return {
    registry,
    httpDuration,
    gatewayConnections,
    gatewayDispatches,
    gatewayReady,
    eventsPublished,
    jobs,
    rateLimitStoreErrors,
  }
}

export type Metrics = ReturnType<typeof createMetrics>

/** The same bus, counting what is published through it. */
export const instrumentEventBus = (bus: EventBus, metrics: Metrics): EventBus => ({
  publish: (event) => {
    metrics.eventsPublished.inc({ type: event.type })
    return bus.publish(event)
  },
  onEvent: (listener) => bus.onEvent(listener),
  replay: (afterSeq) => bus.replay(afterSeq),
  latestSeq: () => bus.latestSeq(),
  close: () => bus.close(),
})
