import { createPreview } from '../../storage/thumbnail'
import { attachmentKey, previewKey } from './attachment.mapper'

import type { ObjectStorage } from '../../storage/object-storage'
import type { AttachmentRepository, AttachmentRow } from './attachment.repository'
import type { FastifyBaseLogger } from 'fastify'

/** Tries per image before it is marked failed (a crash mid-job counts as a try). */
export const PREVIEW_MAX_ATTEMPTS = 3

export interface PreviewWorkerDeps {
  readonly attachments: AttachmentRepository
  readonly storage: ObjectStorage
  /** Called once a preview is stored, e.g. to tell clients about it. */
  readonly onReady: (row: AttachmentRow & { messageId: string }) => Promise<void>
  readonly log: FastifyBaseLogger
  /** Jobs per claim; each job's lease starts at the claim, so keep it small. */
  readonly batchSize?: number
  /** How long a claimed job stays reserved; a failed attempt is retried after it. */
  readonly leaseMs?: number
  /** Pause between polls when the queue is empty; `nudge` cuts it short. */
  readonly idleMs?: number
}

/**
 * Generates image previews in the background. Jobs live in Postgres (`attachments`), so any
 * number of server processes can run a worker: rows are leased with SKIP LOCKED.
 */
export const createPreviewWorker = ({
  attachments,
  storage,
  onReady,
  log,
  batchSize = 1,
  leaseMs = 2 * 60_000,
  idleMs = 5_000,
}: PreviewWorkerDeps) => {
  let stopped = true
  let loop: Promise<void> | null = null
  let wake: (() => void) | null = null
  // A nudge while a batch runs must not be lost: poll again right after it.
  let nudged = false

  /** False when the job is no longer ours (taken over, or the message was deleted). */
  const generate = async (row: AttachmentRow, messageId: string) => {
    const original = await storage.read(attachmentKey(row, messageId))
    const { width, height, preview } = await createPreview(original)
    const key = previewKey(row, messageId)
    await storage.put(key, preview, 'image/webp')
    if (await attachments.completePreview(row, { width, height })) return true
    await storage.delete([key])
    return false
  }

  const process = async (row: AttachmentRow) => {
    const { messageId } = row
    if (!messageId) return
    try {
      if (!(await generate(row, messageId))) return
    } catch (error) {
      log.warn({ err: error, attachmentId: row.id }, 'Image preview failed')
      if (row.previewAttempts >= PREVIEW_MAX_ATTEMPTS) await attachments.failPreview(row)
      return
    }
    try {
      await onReady({ ...row, messageId })
    } catch (error) {
      log.error({ err: error, attachmentId: row.id }, 'Announcing an image preview failed')
    }
  }

  /** Processes one batch; resolves to how many jobs were taken. */
  const runOnce = async (): Promise<number> => {
    const rows = await attachments.claimPreviewJobs({
      limit: batchSize,
      leaseMs,
      maxAttempts: PREVIEW_MAX_ATTEMPTS,
    })
    // One at a time: decoding is CPU- and memory-heavy, and sharp already uses threads.
    for (const row of rows) await process(row)
    return rows.length
  }

  const idle = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        wake = null
        resolve()
      }
      const timer = setTimeout(done, idleMs)
      wake = done
    })

  const run = async () => {
    while (!stopped) {
      nudged = false
      let taken = 0
      try {
        taken = await runOnce()
      } catch (error) {
        log.error({ err: error }, 'Preview worker failed to poll')
      }
      // A full batch means more may be waiting.
      if (!stopped && !nudged && taken < batchSize) await idle()
    }
  }

  return {
    runOnce,

    start() {
      if (loop) return
      stopped = false
      loop = run()
    },

    /** New work arrived: poll now instead of after the idle pause. */
    nudge() {
      nudged = true
      wake?.()
    },

    async stop() {
      stopped = true
      wake?.()
      await loop
      loop = null
    },
  }
}

export type PreviewWorker = ReturnType<typeof createPreviewWorker>
