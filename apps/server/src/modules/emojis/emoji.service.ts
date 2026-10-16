import { MAX_GUILD_EMOJIS, Permission, customEmojiUrl } from '@chinchi/shared'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { uniqueViolationConstraint } from '../../db/errors'
import { guildEmojis } from '../../db/schema'
import { guildTopic } from '../../events/event-bus'
import { HttpError, badRequest, conflict } from '../../http/http-error'
import { createLimiter } from '../../http/limiter'
import { detectImageType } from '@chinchi/shared'
import { createEmojiImage } from '../../storage/thumbnail'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { ObjectStorage } from '../../storage/object-storage'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildEmoji, Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

export type EmojiRow = typeof guildEmojis.$inferSelect

const URL_WINDOW_MS = 60 * 60 * 1000
const URL_TTL_S = (2 * URL_WINDOW_MS) / 1000

/** Object key of a server emoji's picture. */
export const emojiKey = (row: Pick<EmojiRow, 'guildId' | 'id'>) =>
  `emojis/${row.guildId}/${row.id}.webp`

export const toGuildEmoji = (row: EmojiRow): GuildEmoji => ({
  id: row.id,
  name: row.name,
  url: customEmojiUrl(row.id),
  animated: row.animated,
})

const unknownEmoji = () => new HttpError(404, 'UNKNOWN_EMOJI', 'Unknown emoji')
const nameTaken = () =>
  conflict('EMOJI_NAME_TAKEN', 'This server already has an emoji with that name')

export const createEmojiRepository = (db: Database) => ({
  listByGuild: (guildId: Snowflake): Promise<EmojiRow[]> =>
    db
      .select()
      .from(guildEmojis)
      .where(eq(guildEmojis.guildId, guildId))
      .orderBy(asc(guildEmojis.id)),

  async find(id: Snowflake): Promise<EmojiRow | null> {
    const [row] = await db.select().from(guildEmojis).where(eq(guildEmojis.id, id))
    return row ?? null
  },
})

export type EmojiRepository = ReturnType<typeof createEmojiRepository>

export interface EmojiServiceDeps {
  readonly db: Database
  readonly emojis: EmojiRepository
  readonly access: Pick<GuildAccessChecks, 'requirePermission' | 'requireMember'>
  readonly storage: ObjectStorage | undefined
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly log: FastifyBaseLogger
  readonly now?: () => Date
}

/** A server's own emoji: uploaded by those who manage it, usable by its members. */
export const createEmojiService = ({
  db,
  emojis,
  access,
  storage,
  events,
  nextId,
  log,
  now = () => new Date(),
}: EmojiServiceDeps) => {
  // Decoding pictures is the expensive part: a couple at a time per process.
  const limit = createLimiter(3)

  const announce = async (guildId: Snowflake) =>
    events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_EMOJIS_UPDATE',
      data: { guildId, emojis: (await emojis.listByGuild(guildId)).map(toGuildEmoji) },
    })

  const requireStorage = () => {
    if (!storage) throw badRequest('UPLOADS_DISABLED', 'File uploads are disabled')
    return storage
  }

  return {
    async create(
      guildId: Snowflake,
      userId: Snowflake,
      name: string,
      input: Uint8Array,
    ): Promise<GuildEmoji> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      const target = requireStorage()
      if (!detectImageType(input))
        throw badRequest('INVALID_IMAGE', 'The file is not a supported image')
      const { image, animated } = await limit(() =>
        createEmojiImage(input).catch(() => {
          throw badRequest('INVALID_IMAGE', 'The file is not a supported image')
        }),
      )
      const row: EmojiRow = {
        id: nextId(),
        guildId,
        name,
        animated,
        createdBy: userId,
        createdAt: now(),
      }
      // The picture first: a row never points at a missing object. If the row then can't be
      // written, the object goes (best effort).
      await target.put(emojiKey(row), image, 'image/webp')
      try {
        // The count and the insert under the server's lock, so the cap holds under races.
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`emojis:${guildId}`}, 0))`,
          )
          const [{ total } = { total: 0 }] = await tx
            .select({ total: count() })
            .from(guildEmojis)
            .where(eq(guildEmojis.guildId, guildId))
          if (Number(total) >= MAX_GUILD_EMOJIS) {
            throw badRequest('TOO_MANY_EMOJIS', 'This server has as many emoji as allowed')
          }
          await tx.insert(guildEmojis).values(row)
        })
      } catch (error) {
        await target.delete([emojiKey(row)]).catch((cleanup: unknown) => {
          log.warn({ err: cleanup }, 'Failed to delete an unused emoji image')
        })
        if (uniqueViolationConstraint(error)) throw nameTaken()
        throw error
      }
      await announce(guildId)
      return toGuildEmoji(row)
    },

    async rename(
      guildId: Snowflake,
      userId: Snowflake,
      emojiId: Snowflake,
      name: string,
    ): Promise<GuildEmoji> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      let updated: EmojiRow | undefined
      try {
        ;[updated] = await db
          .update(guildEmojis)
          .set({ name })
          .where(and(eq(guildEmojis.id, emojiId), eq(guildEmojis.guildId, guildId)))
          .returning()
      } catch (error) {
        if (uniqueViolationConstraint(error)) throw nameTaken()
        throw error
      }
      if (!updated) throw unknownEmoji()
      await announce(guildId)
      return toGuildEmoji(updated)
    },

    async delete(guildId: Snowflake, userId: Snowflake, emojiId: Snowflake): Promise<void> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      const [removed] = await db
        .delete(guildEmojis)
        .where(and(eq(guildEmojis.id, emojiId), eq(guildEmojis.guildId, guildId)))
        .returning()
      if (!removed) throw unknownEmoji()
      try {
        await storage?.delete([emojiKey(removed)])
      } catch (error) {
        // Only costs space: the URL already answers 404.
        log.warn({ err: error }, 'Failed to delete an emoji image')
      }
      await announce(guildId)
    },

    /** A presigned URL for an emoji image; deleted ones are 404. */
    async resolve(emojiId: Snowflake): Promise<{ url: string; maxAgeS: number }> {
      const target = requireStorage()
      const row = await emojis.find(emojiId)
      if (!row) throw unknownEmoji()
      const nowMs = now().getTime()
      const windowStart = nowMs - (nowMs % URL_WINDOW_MS)
      const url = await target.presignGet(emojiKey(row), {
        filename: `${row.id}.webp`,
        contentType: 'image/webp',
        inline: true,
        expiresIn: URL_TTL_S,
        signedAt: new Date(windowStart),
      })
      return { url, maxAgeS: Math.floor((windowStart + URL_WINDOW_MS - nowMs) / 1000) }
    },
  }
}

export type EmojiService = ReturnType<typeof createEmojiService>
