import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { inject } from 'vitest'

import { createMetrics } from '../metrics/metrics'
import { createRedis } from '../redis/client'
import { createScheduler } from './scheduler'

const cache = createRedis(inject('redisUrl'))
const redis = cache.redis

beforeEach(async () => {
  await redis.flushdb()
})

afterAll(async () => {
  await cache.close()
})

describe('scheduler', () => {
  it('runs a job on one process per interval, whichever takes the lock', async () => {
    const runs: string[] = []
    const job = (who: string) => ({
      name: 'cleanup',
      everyMs: 60_000,
      run: async () => {
        runs.push(who)
      },
    })
    const first = createScheduler({ redis, jobs: [job('a')] })
    const second = createScheduler({ redis, jobs: [job('b')] })

    await first.tick()
    await second.tick()
    await first.tick()

    expect(runs).toEqual(['a'])
  })

  it('counts outcomes and keeps going after a job fails', async () => {
    const metrics = createMetrics()
    const failures: unknown[] = []
    const scheduler = createScheduler({
      redis,
      metrics,
      onError: (_name, error) => failures.push(error),
      jobs: [
        {
          name: 'broken',
          everyMs: 1,
          run: async () => {
            throw new Error('boom')
          },
        },
        { name: 'fine', everyMs: 1, run: async () => undefined },
      ],
    })

    await scheduler.tick()

    expect(failures).toHaveLength(1)
    const text = await metrics.registry.metrics()
    expect(text).toContain('chinchi_background_jobs_total{kind="broken",outcome="error"} 1')
    expect(text).toContain('chinchi_background_jobs_total{kind="fine",outcome="ok"} 1')
  })

  it('ticks on a timer once started, and stops', async () => {
    let runs = 0
    const scheduler = createScheduler({
      redis,
      tickMs: 20,
      jobs: [{ name: 'often', everyMs: 1, run: async () => void (runs += 1) }],
    })
    scheduler.start()
    await expect.poll(() => runs).toBeGreaterThan(1)
    await scheduler.stop()
    const settled = runs
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(runs).toBe(settled)
  })
})
