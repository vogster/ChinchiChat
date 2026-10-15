import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryEventBus } from '../events/event-bus'
import { createMetrics, instrumentEventBus } from './metrics'
import { startMetricsServer } from './metrics-server'

let stop: (() => Promise<void>) | undefined

afterEach(async () => {
  await stop?.()
  stop = undefined
})

describe('metrics', () => {
  it('counts published events by type', async () => {
    const metrics = createMetrics()
    const bus = instrumentEventBus(createMemoryEventBus(), metrics)

    await bus.publish({ topic: 'guild:1', type: 'MESSAGE_CREATE', data: {} })
    await bus.publish({ topic: 'guild:1', type: 'MESSAGE_CREATE', data: {} })

    const text = await metrics.registry.metrics()
    expect(text).toContain('chinchi_events_published_total{type="MESSAGE_CREATE"} 2')
  })

  it('keeps registries apart, so several apps can run in one process', () => {
    expect(() => {
      createMetrics()
      createMetrics()
    }).not.toThrow()
  })

  it('are served in the Prometheus text format on their own port', async () => {
    const metrics = createMetrics()
    metrics.gatewayDispatches.inc({ type: 'READY' })
    const server = await startMetricsServer(metrics.registry, { host: '127.0.0.1', port: 0 })
    stop = server.close

    const response = await fetch(`http://127.0.0.1:${server.port}/metrics`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    const text = await response.text()
    expect(text).toContain('chinchi_gateway_dispatches_total{type="READY"} 1')
    expect(text).toContain('process_cpu_user_seconds_total')

    expect((await fetch(`http://127.0.0.1:${server.port}/other`)).status).toBe(404)
  })
})
