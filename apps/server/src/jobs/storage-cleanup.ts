import { and, inArray, isNull, lt } from 'drizzle-orm'

import { attachments, interactions, pendingTimeouts } from '../db/schema'
import { uploadKey } from '../modules/attachments/attachment.mapper'
import { PENDING_TTL_MS } from '../modules/attachments/attachment.service'

import type { Database } from '../db/client'
import type { ListedObject, ObjectStorage } from '../storage/object-storage'
import type { Redis } from 'ioredis'

/** Objects younger than this are never touched: an upload or a send may be in flight. */
const GRACE_MS = PENDING_TTL_MS
/** Listing pages per prefix and run (1000 keys each); the next run resumes after them. */
const PAGES_PER_RUN = 10

const cursorKey = (prefix: string) => `chinchi:jobs:storage-cleanup:after:${prefix}`

export interface StorageCleanupDeps {
  readonly db: Database
  readonly storage?: ObjectStorage | undefined
  /** Keeps the listing position between runs; without it every run starts over. */
  readonly redis?: Redis | undefined
  readonly now?: () => Date
}

export interface CleanupResult {
  readonly abandonedUploads: number
  readonly deletedObjects: number
  readonly expiredInteractions: number
}

/** `attachments/<channel>/<message>/<id>[.preview.webp]` → its message and attachment ids. */
const parseAttachmentKey = (key: string) => {
  const [, , messageId, file] = key.split('/')
  const id = file?.split('.')[0]
  return messageId && id ? { messageId, id } : null
}

/**
 * Housekeeping nothing else does: unsent uploads (rows and files), files whose message,
 * channel or server is gone (their rows went with a cascade), and expired bot interactions.
 * Storage is compared with the database by listing, so every way of deleting is covered.
 */
export const createStorageCleanup = ({
  db,
  storage,
  redis,
  now = () => new Date(),
}: StorageCleanupDeps) => {
  /** Uploads still waiting to be sent; sent ones were copied and their upload is garbage. */
  const liveUploads = async (objects: readonly ListedObject[]) => {
    const ids = objects.flatMap((o) => o.key.split('/')[2] ?? [])
    if (ids.length === 0) return new Set<string>()
    const rows = await db
      .select({ id: attachments.id, channelId: attachments.channelId })
      .from(attachments)
      .where(and(inArray(attachments.id, ids), isNull(attachments.messageId)))
    return new Set(rows.map(uploadKey))
  }

  /** Files of attachments that still belong to their message. */
  const liveFiles = async (objects: readonly ListedObject[]) => {
    const parsed = objects.flatMap((o) => {
      const parts = parseAttachmentKey(o.key)
      return parts ? [{ key: o.key, ...parts }] : []
    })
    if (parsed.length === 0) return new Set<string>()
    const rows = await db
      .select({ id: attachments.id, messageId: attachments.messageId })
      .from(attachments)
      .where(
        inArray(
          attachments.id,
          parsed.map((p) => p.id),
        ),
      )
    const owner = new Map(rows.map((row) => [row.id, row.messageId]))
    return new Set(parsed.filter((p) => owner.get(p.id) === p.messageId).map((p) => p.key))
  }

  const sweep = async (
    store: ObjectStorage,
    prefix: string,
    cutoff: Date,
    live: (objects: readonly ListedObject[]) => Promise<Set<string>>,
  ) => {
    let after = (await redis?.get(cursorKey(prefix))) ?? undefined
    let deleted = 0
    for (let page = 0; page < PAGES_PER_RUN; page += 1) {
      const { objects, more } = await store.list(prefix, { after })
      const old = objects.filter((o) => o.lastModified < cutoff)
      const keep = await live(old)
      const garbage = old.filter((o) => !keep.has(o.key)).map((o) => o.key)
      if (garbage.length > 0) await store.delete(garbage)
      deleted += garbage.length
      after = more ? objects.at(-1)?.key : undefined
      if (!after) break
    }
    if (after) await redis?.set(cursorKey(prefix), after)
    else await redis?.del(cursorKey(prefix))
    return deleted
  }

  return {
    async run(): Promise<CleanupResult> {
      const cutoff = new Date(now().getTime() - GRACE_MS)
      const abandoned = await db
        .delete(attachments)
        .where(and(isNull(attachments.messageId), lt(attachments.createdAt, cutoff)))
        .returning({ id: attachments.id, channelId: attachments.channelId })
      const expired = await db
        .delete(interactions)
        .where(lt(interactions.expiresAt, cutoff))
        .returning({ id: interactions.id })
      // Timeouts kept for people who left: once over, there is nothing to restore.
      await db.delete(pendingTimeouts).where(lt(pendingTimeouts.until, now()))

      let deletedObjects = 0
      if (storage) {
        if (abandoned.length > 0) await storage.delete(abandoned.map(uploadKey))
        deletedObjects += await sweep(storage, 'uploads/', cutoff, liveUploads)
        deletedObjects += await sweep(storage, 'attachments/', cutoff, liveFiles)
      }
      return {
        abandonedUploads: abandoned.length,
        deletedObjects,
        expiredInteractions: expired.length,
      }
    },
  }
}
