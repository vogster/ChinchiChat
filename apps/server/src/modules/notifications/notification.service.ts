import { userTopic } from '../../events/event-bus'
import { badRequest } from '../../http/http-error'

import type { EventBus } from '../../events/event-bus'
import type { ChannelService } from '../channels/channel.service'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildRepository } from '../guilds/guild.repository'
import type { NotificationRepository } from './notification.repository'
import type {
  NotificationSetting,
  Snowflake,
  UpdateNotificationSettingRequest,
} from '@chinchi/shared'

export interface NotificationServiceDeps {
  readonly settings: NotificationRepository
  readonly guilds: Pick<GuildRepository, 'findById'>
  readonly access: Pick<GuildAccessChecks, 'requireMember'>
  readonly channels: Pick<ChannelService, 'resolve'>
  readonly events: EventBus
  readonly now?: () => number
}

const defaults = (targetId: Snowflake): NotificationSetting => ({
  targetId,
  level: null,
  muted: false,
  mutedUntil: null,
})

/** The request applied on top of what is stored: fields left out keep their value. */
const merge = (
  current: NotificationSetting,
  body: UpdateNotificationSettingRequest,
): NotificationSetting => {
  const muted = body.muted ?? current.muted
  // A fresh mute without an end lasts until lifted; lifting it forgets the end.
  const mutedUntil = !muted
    ? null
    : body.mutedUntil !== undefined
      ? body.mutedUntil
      : body.muted === true
        ? null
        : current.mutedUntil
  return {
    targetId: current.targetId,
    level: body.level !== undefined ? body.level : current.level,
    muted,
    mutedUntil,
  }
}

const isDefault = (setting: NotificationSetting) => setting.level === null && !setting.muted

export const createNotificationService = ({
  settings,
  guilds,
  access,
  channels,
  events,
  now = Date.now,
}: NotificationServiceDeps) => {
  /** Servers the user belongs to and channels (DMs included) they can see; 404 otherwise. */
  const assertVisible = async (userId: Snowflake, targetId: Snowflake) => {
    if (await guilds.findById(targetId)) {
      await access.requireMember(targetId, userId)
      return
    }
    await channels.resolve(targetId, userId)
  }

  return {
    list: (userId: Snowflake) => settings.listForUser(userId),

    async update(
      userId: Snowflake,
      targetId: Snowflake,
      body: UpdateNotificationSettingRequest,
    ): Promise<NotificationSetting> {
      await assertVisible(userId, targetId)
      if (body.mutedUntil && Date.parse(body.mutedUntil) <= now()) {
        throw badRequest('INVALID_MUTE_END', 'A mute must end in the future')
      }
      const next = merge((await settings.find(userId, targetId)) ?? defaults(targetId), body)
      if (isDefault(next)) await settings.remove(userId, targetId)
      else await settings.save(userId, next)
      await events.publish({
        topic: userTopic(userId),
        type: 'NOTIFICATION_SETTINGS_UPDATE',
        data: { targetId, setting: isDefault(next) ? null : next },
      })
      return next
    },
  }
}

export type NotificationService = ReturnType<typeof createNotificationService>
