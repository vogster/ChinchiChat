import { channelFollowerSchema, messageSchema, webhookSchema } from '@chinchi/shared'
import { z } from 'zod'

import { id } from './url'

import type { Http } from './http'
import type { Snowflake } from '@chinchi/shared'

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
    /** Who follows the channel: all of them for its managers, your own follows for others. */
    followers: (sourceChannelId: Snowflake) =>
      request({
        method: 'GET',
        path: `/channels/${id(sourceChannelId)}/followers`,
        data: z.object({ followers: z.array(channelFollowerSchema) }),
      }),
    /** Ends a follow, from either side (its webhook goes). */
    unfollow: (sourceChannelId: Snowflake, webhookId: Snowflake) =>
      request({
        method: 'DELETE',
        path: `/channels/${id(sourceChannelId)}/followers/${id(webhookId)}`,
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
