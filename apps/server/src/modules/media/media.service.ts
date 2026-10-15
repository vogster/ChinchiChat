import { Permission } from '@chinchi/shared'

import { guildTopic } from '../../events/event-bus'
import { HttpError, badRequest } from '../../http/http-error'
import { createLimiter } from '../../http/limiter'
import { detectImageType } from '@chinchi/shared'
import {
  PROFILE_MAX_INPUT_PIXELS,
  createBannerImage,
  createProfileImage,
} from '../../storage/thumbnail'
import { toGuild } from '../guilds/guild.mapper'
import { profileImageKey } from './media-paths'

import type { EventBus } from '../../events/event-bus'
import type { ObjectStorage } from '../../storage/object-storage'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildRepository, GuildRow } from '../guilds/guild.repository'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { ProfileImageKind } from './media-paths'
import type { Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

/** Images are content-addressed by id, so the redirect may be cached for a while. */
const URL_WINDOW_MS = 60 * 60 * 1000
const URL_TTL_S = (2 * URL_WINDOW_MS) / 1000
/** Decodes running at once in this process; more are refused with 503 instead of piling up. */
const MAX_CONCURRENT_IMAGES = 3

export interface MediaServiceDeps {
  readonly users: UserRepository
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly storage: ObjectStorage | undefined
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly log: FastifyBaseLogger
  /** Called after an avatar change, to announce the new profile. */
  readonly onProfileChanged?: (user: UserRow) => Promise<void>
  readonly now?: () => Date
}

const uploadsDisabled = () => badRequest('UPLOADS_DISABLED', 'File uploads are disabled')
const invalidImage = () => badRequest('INVALID_IMAGE', 'The file is not a supported image')
const unknownImage = () => new HttpError(404, 'UNKNOWN_IMAGE', 'Unknown image')

/** Avatars and server icons: processed in the request (they are small) and served publicly. */
export const createMediaService = ({
  users,
  guilds,
  access,
  storage,
  events,
  nextId,
  log,
  onProfileChanged = async () => undefined,
  now = () => new Date(),
}: MediaServiceDeps) => {
  const limit = createLimiter(MAX_CONCURRENT_IMAGES)

  const requireStorage = () => {
    if (!storage) throw uploadsDisabled()
    return storage
  }

  /** Processes and stores a new image; resolves to its id. */
  const store = async (kind: ProfileImageKind, ownerId: Snowflake, input: Uint8Array) => {
    const target = requireStorage()
    if (!detectImageType(input)) throw invalidImage()
    const process = () =>
      kind === 'banners'
        ? createBannerImage(input)
        : createProfileImage(input, { maxPixels: PROFILE_MAX_INPUT_PIXELS })
    const image = await limit(() =>
      process().catch(() => {
        throw invalidImage()
      }),
    )
    const imageId = nextId()
    await target.put(profileImageKey(kind, ownerId, imageId), image, 'image/webp')
    return imageId
  }

  /** Best effort: an old image only costs space, its URL already answers 404. */
  const discard = async (kind: ProfileImageKind, ownerId: Snowflake, imageId: Snowflake | null) => {
    if (!storage || !imageId) return
    try {
      await storage.delete([profileImageKey(kind, ownerId, imageId)])
    } catch (error) {
      log.warn({ err: error }, 'Failed to delete an old profile image')
    }
  }

  /** Points the owner at a new image (or none); on failure the new object is dropped. */
  const replace = async <T>(
    kind: ProfileImageKind,
    ownerId: Snowflake,
    imageId: Snowflake | null,
    write: () => Promise<{ previousId: Snowflake | null; row: T }>,
  ): Promise<T> => {
    let result: { previousId: Snowflake | null; row: T }
    try {
      result = await write()
    } catch (error) {
      await discard(kind, ownerId, imageId)
      throw error
    }
    // The id actually replaced (read under a lock), so racing uploads never leak objects.
    await discard(kind, ownerId, result.previousId)
    return result.row
  }

  const setGuildIcon = async (guildId: Snowflake, iconId: Snowflake | null) => {
    const updated = await replace('icons', guildId, iconId, async () => {
      const { guild, previousId } = await guilds.replaceIcon(guildId, iconId)
      return { row: guild, previousId }
    })
    await events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_UPDATE',
      data: toGuild(updated),
    })
    return updated
  }

  const setAvatar = async (userId: Snowflake, avatarId: Snowflake | null) => {
    const updated = await replace('avatars', userId, avatarId, async () => {
      const { user, previousId } = await users.replaceAvatar(userId, avatarId)
      return { row: user, previousId }
    })
    await onProfileChanged(updated)
    return updated
  }

  const setBanner = async (userId: Snowflake, bannerId: Snowflake | null) => {
    const updated = await replace('banners', userId, bannerId, async () => {
      const { user, previousId } = await users.replaceBanner(userId, bannerId)
      return { row: user, previousId }
    })
    await onProfileChanged(updated)
    return updated
  }

  return {
    async setBanner(user: UserRow, input: Uint8Array): Promise<UserRow> {
      return setBanner(user.id, await store('banners', user.id, input))
    },

    clearBanner: (user: UserRow): Promise<UserRow> => setBanner(user.id, null),

    async setAvatar(user: UserRow, input: Uint8Array): Promise<UserRow> {
      return setAvatar(user.id, await store('avatars', user.id, input))
    },

    clearAvatar: (user: UserRow): Promise<UserRow> => setAvatar(user.id, null),

    async setGuildIcon(guildId: Snowflake, userId: Snowflake, input: Uint8Array) {
      // Check access before doing any image work.
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      return setGuildIcon(guildId, await store('icons', guildId, input))
    },

    async clearGuildIcon(guildId: Snowflake, userId: Snowflake) {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      return setGuildIcon(guildId, null)
    },

    /** The server is gone: so is its icon. */
    discardGuildFiles: (guild: GuildRow) => discard('icons', guild.id, guild.iconId),

    /** A presigned URL for the current image of a user or server; old ids are 404. */
    async resolve(
      kind: ProfileImageKind,
      ownerId: Snowflake,
      imageId: Snowflake,
    ): Promise<{ url: string; maxAgeS: number }> {
      const target = requireStorage()
      const owner =
        kind === 'avatars'
          ? (await users.findById(ownerId))?.avatarId
          : kind === 'banners'
            ? (await users.findById(ownerId))?.bannerId
            : (await guilds.findById(ownerId))?.iconId
      if (!owner || owner !== imageId) throw unknownImage()

      const nowMs = now().getTime()
      const windowStart = nowMs - (nowMs % URL_WINDOW_MS)
      const url = await target.presignGet(profileImageKey(kind, ownerId, imageId), {
        filename: `${imageId}.webp`,
        contentType: 'image/webp',
        inline: true,
        expiresIn: URL_TTL_S,
        signedAt: new Date(windowStart),
      })
      return { url, maxAgeS: Math.floor((windowStart + URL_WINDOW_MS - nowMs) / 1000) }
    },
  }
}

export type MediaService = ReturnType<typeof createMediaService>
