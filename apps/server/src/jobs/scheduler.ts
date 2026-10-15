import { randomUUID } from 'node:crypto'

import type { Metrics } from '../metrics/metrics'
import type { Redis } from 'ioredis'

export interface ScheduledJob {
  /** Also the lock's name: one process in the cluster runs it per interval. */
  readonly name: string
  readonly everyMs: number
  readonly run: () => Promise<void>
}

export interface SchedulerDeps {
  readonly redis: Redis
  readonly jobs: readonly ScheduledJob[]
  /** How often the scheduler checks whether a job is due. */
  readonly tickMs?: number
  readonly metrics?: Pick<Metrics, 'jobs'>
  readonly onError?: (name: string, error: unknown) => void
}

const lockKey = (name: string) => `chinchi:jobs:lock:${name}`

/**
 * Periodic background work shared by every server process. Each job takes a Valkey lock
 * that lives for its interval (`SET NX PX`): whichever process gets it runs the job, the
 * others skip, and the lock simply expires — a crashed process can't hold it forever.
 */
export const createScheduler = ({
  redis,
  jobs,
  tickMs = 15_000,
  metrics,
  onError = () => undefined,
}: SchedulerDeps) => {
  const owner = randomUUID()
  let timer: ReturnType<typeof setInterval> | undefined
  let running: Promise<void> = Promise.resolve()

  const runJob = async (job: ScheduledJob) => {
    const taken = await redis.set(lockKey(job.name), owner, 'PX', job.everyMs, 'NX')
    if (taken !== 'OK') return
    try {
      await job.run()
      metrics?.jobs.inc({ kind: job.name, outcome: 'ok' })
    } catch (error) {
      metrics?.jobs.inc({ kind: job.name, outcome: 'error' })
      onError(job.name, error)
    }
  }

  /** Runs every due job once (tests call it directly). */
  const tick = async () => {
    for (const job of jobs) await runJob(job)
  }

  return {
    tick,
    start() {
      if (timer) return
      timer = setInterval(() => {
        // Never overlap: a slow tick delays the next one instead of piling up.
        running = running.then(tick).catch(() => undefined)
      }, tickMs)
      timer.unref()
    },
    async stop() {
      clearInterval(timer)
      timer = undefined
      await running
    },
  }
}

export type Scheduler = ReturnType<typeof createScheduler>
