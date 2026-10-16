import {
  notificationSettingSchema,
  privateChannelSchema,
  relationshipSchema,
  voiceConnectionSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { id } from './url'

import type { Http } from './http'
import type {
  JoinVoiceRequest,
  MemberVoiceRequest,
  Snowflake,
  UpdateNotificationSettingRequest,
  UpdateVoiceStateRequest,
} from '@chinchi/shared'

const relationshipResult = z.object({ relationship: relationshipSchema })
const privateChannelResult = z.object({ channel: privateChannelSchema })

/** People: friends and blocks, direct messages, notification settings, voice. */
export const createSocialApi = (request: Http) => ({
  relationships: {
    list: () =>
      request({
        method: 'GET',
        path: '/users/@me/relationships',
        data: z.object({ relationships: z.array(relationshipSchema) }),
      }),
    /** Sends (or accepts) a friend request by username. */
    request: (username: string) =>
      request({
        method: 'POST',
        path: '/users/@me/relationships',
        body: { username },
        data: relationshipResult,
      }),
    accept: (userId: Snowflake) =>
      request({
        method: 'PUT',
        path: `/users/@me/relationships/${id(userId)}`,
        body: { type: 'friend' },
        data: relationshipResult,
      }),
    block: (userId: Snowflake) =>
      request({
        method: 'PUT',
        path: `/users/@me/relationships/${id(userId)}`,
        body: { type: 'blocked' },
        data: relationshipResult,
      }),
    /** Unfriend, cancel, decline or unblock. */
    remove: (userId: Snowflake) =>
      request({ method: 'DELETE', path: `/users/@me/relationships/${id(userId)}` }),
  },
  dms: {
    list: () =>
      request({
        method: 'GET',
        path: '/users/@me/channels',
        data: z.object({ channels: z.array(privateChannelSchema) }),
      }),
    /**
     * One recipient opens (or finds) the 1:1 DM; several start a group with friends.
     * `encrypted` opens the encrypted conversation with that person (started if missing).
     */
    open: (recipientIds: readonly Snowflake[], { encrypted = false } = {}) =>
      request({
        method: 'POST',
        path: '/users/@me/channels',
        body: encrypted ? { recipientIds, encrypted } : { recipientIds },
        data: privateChannelResult,
      }),
    /** Names a group DM; null or '' goes back to listing the members. */
    rename: (channelId: Snowflake, name: string | null) =>
      request({
        method: 'PATCH',
        path: `/users/@me/channels/${id(channelId)}`,
        body: { name },
        data: privateChannelResult,
      }),
    addRecipient: (channelId: Snowflake, userId: Snowflake) =>
      request({ method: 'PUT', path: `/channels/${id(channelId)}/recipients/${id(userId)}` }),
    /** The owner removes someone; your own id leaves the group. */
    removeRecipient: (channelId: Snowflake, userId: Snowflake) =>
      request({ method: 'DELETE', path: `/channels/${id(channelId)}/recipients/${id(userId)}` }),
  },
  /** My notification settings for servers, channels and DMs (see resolveNotifications). */
  notifications: {
    list: () =>
      request({
        method: 'GET',
        path: '/users/@me/notification-settings',
        data: z.object({ notificationSettings: z.array(notificationSettingSchema) }),
      }),
    update: (targetId: Snowflake, body: UpdateNotificationSettingRequest) =>
      request({
        method: 'PUT',
        path: `/users/@me/notification-settings/${id(targetId)}`,
        body,
        data: z.object({ setting: notificationSettingSchema }),
      }),
  },
  voice: {
    /** A LiveKit address and token for the voice channel. */
    join: (channelId: Snowflake, body: JoinVoiceRequest = {}) =>
      request({
        method: 'POST',
        path: `/channels/${id(channelId)}/voice`,
        body,
        data: z.object({ connection: voiceConnectionSchema }),
      }),
    /** Your own mute and deafen while connected. */
    updateState: (body: UpdateVoiceStateRequest) =>
      request({ method: 'PATCH', path: '/users/@me/voice-state', body }),
    /** Server mute, server deafen or disconnect someone. */
    moderate: (guildId: Snowflake, userId: Snowflake, body: MemberVoiceRequest) =>
      request({
        method: 'PATCH',
        path: `/guilds/${id(guildId)}/members/${id(userId)}/voice`,
        body,
      }),
    /** Sends someone in voice to another voice channel of the server. */
    move: (guildId: Snowflake, userId: Snowflake, channelId: Snowflake) =>
      request({
        method: 'POST',
        path: `/guilds/${id(guildId)}/members/${id(userId)}/voice/move`,
        body: { channelId },
      }),
  },
})
