import { messageSchema, webhookSchema } from '@chinchi/shared'
import { z } from 'zod'

import type { Http } from './http'
import type { Snowflake } from '@chinchi/shared'

const id = (value: string) => encodeURIComponent(value)

/** Announcement channels: follow them into your channels, publish their messages. */
export const createAnnouncementsApi = (request: Http) => ({
  announcements: {
    /** Copies the source channel's published messages into `channelId` (via a webhook). */
    follow: (sourceChannelId: Snowflake, channelId: Snowflake) =>
      request({
        method: 'POST',
        path: `/channels/${id(sourceChannelId)}/followers`,
        body: { channelId },
        data: z.object({ webhook: webhookSchema }),
      }),
    /** Sends a message out once to every following channel. */
    publish: (channelId: Snowflake, messageId: Snowflake) =>
      request({
        method: 'POST',
        path: `/channels/${id(channelId)}/messages/${id(messageId)}/publish`,
        data: z.object({ message: messageSchema }),
      }),
  },
})
