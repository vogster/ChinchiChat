import {
  notificationSettingSchema,
  snowflakeSchema,
  updateNotificationSettingRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireHuman } from '../auth/auth.plugin'

import type { NotificationService } from './notification.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface NotificationsRoutesOptions {
  readonly notificationService: NotificationService
}

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })

export const notificationsRoutes: FastifyPluginAsyncZod<NotificationsRoutesOptions> = async (
  app,
  { notificationService },
) => {
  app.get(
    '/users/@me/notification-settings',
    {
      schema: {
        response: {
          200: ok(z.object({ notificationSettings: z.array(notificationSettingSchema) })),
        },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        notificationSettings: await notificationService.list(requireHuman(request).user.id),
      },
    }),
  )

  app.put(
    '/users/@me/notification-settings/:targetId',
    {
      schema: {
        params: z.object({ targetId: snowflakeSchema }),
        body: updateNotificationSettingRequestSchema,
        response: { 200: ok(z.object({ setting: notificationSettingSchema })) },
      },
    },
    async (request) => {
      const setting = await notificationService.update(
        requireHuman(request).user.id,
        request.params.targetId,
        request.body,
      )
      return { success: true as const, data: { setting } }
    },
  )
}
