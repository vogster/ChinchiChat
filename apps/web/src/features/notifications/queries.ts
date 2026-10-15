import { queryOptions } from '@tanstack/react-query'

import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@chinchi/sdk'
import type { NotificationSetting, Snowflake } from '@chinchi/shared'

export const notificationKeys = {
  all: ['notificationSettings'] as const,
}

/** My settings that differ from the defaults; seeded by READY, kept current by the gateway. */
export const notificationSettingsQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: notificationKeys.all,
    queryFn: async (): Promise<NotificationSetting[]> =>
      (await api.notifications.list()).notificationSettings,
    staleTime: Infinity,
  })

/** Stores one target's settings; null means back to the defaults. */
export const setNotificationSetting = (
  queryClient: QueryClient,
  targetId: Snowflake,
  setting: NotificationSetting | null,
) =>
  queryClient.setQueryData<NotificationSetting[]>(notificationKeys.all, (settings = []) => [
    ...settings.filter((item) => item.targetId !== targetId),
    ...(setting ? [setting] : []),
  ])
