import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveNotifications } from '@chinchi/shared'

import { useApi } from '../../lib/api-context'
import { useMinuteClock } from '../../lib/use-minute-clock'
import { notificationSettingsQueryOptions, setNotificationSetting } from './queries'

import type {
  NotificationSetting,
  ResolvedNotifications,
  Snowflake,
  UpdateNotificationSettingRequest,
} from '@chinchi/shared'

/** Something notifications can be set for: a server channel (with its parents) or a DM. */
export interface NotifiableChannel {
  readonly id: Snowflake
  readonly guildId?: Snowflake | null
  readonly parentId?: Snowflake | null
}

export const useNotificationSettings = (): ReadonlyMap<Snowflake, NotificationSetting> => {
  const { data = [] } = useQuery(notificationSettingsQueryOptions(useApi()))
  return new Map(data.map((setting) => [setting.targetId, setting]))
}

/**
 * What applies in a channel or DM. `channels` are the server's channels, to walk up from a
 * thread to its channel and category.
 */
export const useNotificationResolver = () => {
  const settings = useNotificationSettings()
  const now = useMinuteClock()
  return (
    channel: NotifiableChannel,
    channels: readonly NotifiableChannel[] = [],
  ): ResolvedNotifications => {
    const chain = [channel.id]
    let parentId = channel.parentId ?? null
    // Thread → channel → category at most; the bound guards against a malformed cycle.
    while (parentId && chain.length < 4) {
      chain.push(parentId)
      const id: Snowflake = parentId
      parentId = channels.find((c) => c.id === id)?.parentId ?? null
    }
    return resolveNotifications(
      settings,
      { guildId: channel.guildId ?? null, channelIds: chain },
      now,
    )
  }
}

/** Whether a whole server is muted. */
export const useGuildMuted = () => {
  const resolve = useNotificationResolver()
  return (guildId: Snowflake) => resolve({ id: guildId, guildId: null }).muted
}

export const useUpdateNotificationSetting = (targetId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateNotificationSettingRequest) =>
      api.notifications.update(targetId, body),
    onSuccess: ({ setting }) => {
      const isDefault = setting.level === null && !setting.muted
      setNotificationSetting(queryClient, targetId, isDefault ? null : setting)
    },
  })
}
