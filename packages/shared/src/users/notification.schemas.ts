import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

/** Which messages notify: every one, only those mentioning me (or replying to me), or none. */
export const notificationLevelSchema = z.enum(['all', 'mentions', 'none'])

/**
 * My notification settings for a server, a channel (category, thread) or a DM. A missing row
 * means the defaults; `level: null` inherits from the parent (channel → category → server).
 */
export const notificationSettingSchema = z.object({
  targetId: snowflakeSchema,
  level: notificationLevelSchema.nullable(),
  /** Muted: no notifications and no unread marker (mention counts still show). */
  muted: z.boolean(),
  /** When a timed mute ends; null mutes until it is lifted. */
  mutedUntil: z.iso.datetime().nullable(),
})

export const updateNotificationSettingRequestSchema = z
  .strictObject({
    level: notificationLevelSchema.nullable().optional(),
    muted: z.boolean().optional(),
    mutedUntil: z.iso.datetime().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')
  .refine(
    (body) => body.mutedUntil === undefined || body.mutedUntil === null || body.muted === true,
    'An end time needs muted: true',
  )

export type NotificationLevel = z.infer<typeof notificationLevelSchema>
export type NotificationSetting = z.infer<typeof notificationSettingSchema>
export type UpdateNotificationSettingRequest = z.infer<
  typeof updateNotificationSettingRequestSchema
>

/** What a server or DM notifies about when nothing is set. */
export const DEFAULT_NOTIFICATION_LEVEL: NotificationLevel = 'all'

export const isMuteActive = (setting: NotificationSetting | undefined, now: number): boolean =>
  setting?.muted === true && (setting.mutedUntil === null || Date.parse(setting.mutedUntil) > now)

export interface NotificationScope {
  /** The server, or null for a DM. */
  readonly guildId: string | null
  /** The channel first, then its ancestors (thread → channel → category). */
  readonly channelIds: readonly string[]
}

export interface ResolvedNotifications {
  readonly muted: boolean
  readonly level: NotificationLevel
}

/**
 * The settings that apply in a channel: muted if it, a parent or its server is muted; the level
 * of the closest one that sets it. Shared by every client so they agree.
 */
export const resolveNotifications = (
  settings: ReadonlyMap<string, NotificationSetting>,
  scope: NotificationScope,
  now: number,
): ResolvedNotifications => {
  const chain = [...scope.channelIds, ...(scope.guildId ? [scope.guildId] : [])]
  const found = chain.map((id) => settings.get(id))
  return {
    muted: found.some((setting) => isMuteActive(setting, now)),
    level: found.find((setting) => setting?.level)?.level ?? DEFAULT_NOTIFICATION_LEVEL,
  }
}

/** Whether a new message should notify, given the resolved settings and whether it mentions me. */
export const shouldNotify = (resolved: ResolvedNotifications, mentioned: boolean): boolean =>
  !resolved.muted && (resolved.level === 'all' || (resolved.level === 'mentions' && mentioned))
