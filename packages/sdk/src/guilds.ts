import {
  channelSchema,
  guildDetailSchema,
  guildEmojiSchema,
  guildSchema,
  inviteSchema,
  memberSchema,
  roleSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { id } from './url'

import type { Http } from './http'
import type {
  CreateChannelRequest,
  CreateGuildRequest,
  CreateInviteRequest,
  CreateRoleRequest,
  CreateThreadRequest,
  PutOverwriteRequest,
  ReorderChannelsRequest,
  ReorderRolesRequest,
  Snowflake,
  UpdateChannelRequest,
  UpdateGuildRequest,
  UpdateRoleRequest,
} from '@chinchi/shared'

const guildResult = z.object({ guild: guildDetailSchema })
const bareGuildResult = z.object({ guild: guildSchema })
const channelResult = z.object({ channel: channelSchema })
const inviteResult = z.object({ invite: inviteSchema })
const roleResult = z.object({ role: roleSchema })
const rolesResult = z.object({ roles: z.array(roleSchema) })
const emojiResult = z.object({ emoji: guildEmojiSchema })

/** Servers and what is in them: channels, invites, roles, permission overwrites, emoji. */
export const createGuildsApi = (request: Http) => ({
  guilds: {
    setIcon: (guildId: Snowflake, image: Blob) =>
      request({
        method: 'PUT',
        path: `/guilds/${id(guildId)}/icon`,
        body: image,
        data: bareGuildResult,
      }),
    clearIcon: (guildId: Snowflake) =>
      request({ method: 'DELETE', path: `/guilds/${id(guildId)}/icon`, data: bareGuildResult }),
    list: () =>
      request({
        method: 'GET',
        path: '/users/@me/guilds',
        data: z.object({ guilds: z.array(guildSchema) }),
      }),
    create: (body: CreateGuildRequest) =>
      request({ method: 'POST', path: '/guilds', body, data: guildResult }),
    get: (guildId: Snowflake) =>
      request({ method: 'GET', path: `/guilds/${id(guildId)}`, data: guildResult }),
    update: (guildId: Snowflake, body: UpdateGuildRequest) =>
      request({ method: 'PATCH', path: `/guilds/${id(guildId)}`, body, data: guildResult }),
    delete: (guildId: Snowflake) => request({ method: 'DELETE', path: `/guilds/${id(guildId)}` }),
    transfer: (guildId: Snowflake, userId: Snowflake) =>
      request({
        method: 'POST',
        path: `/guilds/${id(guildId)}/transfer`,
        body: { userId },
        data: guildResult,
      }),
    members: (guildId: Snowflake) =>
      request({
        method: 'GET',
        path: `/guilds/${id(guildId)}/members`,
        data: z.object({ members: z.array(memberSchema) }),
      }),
    /** A server nickname for yourself or (with MANAGE_NICKNAMES) someone else; null clears it. */
    setNickname: (guildId: Snowflake, userId: Snowflake, nickname: string | null) =>
      request({
        method: 'PATCH',
        path: `/guilds/${id(guildId)}/members/${id(userId)}`,
        body: { nickname },
        data: z.object({ member: memberSchema }),
      }),
    leave: (guildId: Snowflake) =>
      request({ method: 'DELETE', path: `/guilds/${id(guildId)}/members/@me` }),
    /** A newcomer accepts the server's rules (and may talk from then on). */
    acceptRules: (guildId: Snowflake) =>
      request({
        method: 'POST',
        path: `/guilds/${id(guildId)}/rules/accept`,
        data: guildResult,
      }),
    /** Marks every channel of the server I can see read. */
    ack: (guildId: Snowflake) => request({ method: 'POST', path: `/guilds/${id(guildId)}/ack` }),
    invites: (guildId: Snowflake) =>
      request({
        method: 'GET',
        path: `/guilds/${id(guildId)}/invites`,
        data: z.object({ invites: z.array(inviteSchema) }),
      }),
  },
  channels: {
    /** Starts a thread in a text channel, optionally from one of its messages. */
    createThread: (channelId: Snowflake, body: CreateThreadRequest) =>
      request({
        method: 'POST',
        path: `/channels/${id(channelId)}/threads`,
        body,
        data: channelResult,
      }),
    create: (guildId: Snowflake, body: CreateChannelRequest) =>
      request({
        method: 'POST',
        path: `/guilds/${id(guildId)}/channels`,
        body,
        data: channelResult,
      }),
    reorder: (guildId: Snowflake, body: ReorderChannelsRequest) =>
      request({
        method: 'PATCH',
        path: `/guilds/${id(guildId)}/channels`,
        body,
        data: z.object({ channels: z.array(channelSchema) }),
      }),
    get: (channelId: Snowflake) =>
      request({ method: 'GET', path: `/channels/${id(channelId)}`, data: channelResult }),
    update: (channelId: Snowflake, body: UpdateChannelRequest) =>
      request({ method: 'PATCH', path: `/channels/${id(channelId)}`, body, data: channelResult }),
    delete: (channelId: Snowflake) =>
      request({ method: 'DELETE', path: `/channels/${id(channelId)}` }),
  },
  invites: {
    create: (channelId: Snowflake, body: CreateInviteRequest = {}) =>
      request({
        method: 'POST',
        path: `/channels/${id(channelId)}/invites`,
        body,
        data: inviteResult,
      }),
    get: (code: string) =>
      request({ method: 'GET', path: `/invites/${id(code)}`, data: inviteResult }),
    accept: (code: string) =>
      request({ method: 'POST', path: `/invites/${id(code)}`, data: guildResult }),
    revoke: (code: string) => request({ method: 'DELETE', path: `/invites/${id(code)}` }),
  },
  roles: {
    list: (guildId: Snowflake) =>
      request({ method: 'GET', path: `/guilds/${id(guildId)}/roles`, data: rolesResult }),
    create: (guildId: Snowflake, body: CreateRoleRequest = {}) =>
      request({ method: 'POST', path: `/guilds/${id(guildId)}/roles`, body, data: roleResult }),
    update: (guildId: Snowflake, roleId: Snowflake, body: UpdateRoleRequest) =>
      request({
        method: 'PATCH',
        path: `/guilds/${id(guildId)}/roles/${id(roleId)}`,
        body,
        data: roleResult,
      }),
    delete: (guildId: Snowflake, roleId: Snowflake) =>
      request({ method: 'DELETE', path: `/guilds/${id(guildId)}/roles/${id(roleId)}` }),
    reorder: (guildId: Snowflake, body: ReorderRolesRequest) =>
      request({ method: 'PATCH', path: `/guilds/${id(guildId)}/roles`, body, data: rolesResult }),
    addToMember: (guildId: Snowflake, userId: Snowflake, roleId: Snowflake) =>
      request({
        method: 'PUT',
        path: `/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`,
      }),
    removeFromMember: (guildId: Snowflake, userId: Snowflake, roleId: Snowflake) =>
      request({
        method: 'DELETE',
        path: `/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`,
      }),
  },
  permissions: {
    /** Copies the category's overwrites onto the channel. */
    sync: (channelId: Snowflake) =>
      request({ method: 'POST', path: `/channels/${id(channelId)}/sync`, data: channelResult }),
    put: (channelId: Snowflake, targetId: Snowflake, body: PutOverwriteRequest) =>
      request({
        method: 'PUT',
        path: `/channels/${id(channelId)}/permissions/${id(targetId)}`,
        body,
        data: channelResult,
      }),
    delete: (channelId: Snowflake, targetId: Snowflake) =>
      request({
        method: 'DELETE',
        path: `/channels/${id(channelId)}/permissions/${id(targetId)}`,
      }),
  },
  emojis: {
    /** Uploads a server emoji; the picture is the body (PNG/JPEG/GIF/WebP, up to 512 KB). */
    create: (guildId: Snowflake, name: string, image: Blob) =>
      request({
        method: 'POST',
        path: `/guilds/${id(guildId)}/emojis?name=${id(name)}`,
        body: image,
        data: emojiResult,
      }),
    rename: (guildId: Snowflake, emojiId: Snowflake, name: string) =>
      request({
        method: 'PATCH',
        path: `/guilds/${id(guildId)}/emojis/${id(emojiId)}`,
        body: { name },
        data: emojiResult,
      }),
    delete: (guildId: Snowflake, emojiId: Snowflake) =>
      request({ method: 'DELETE', path: `/guilds/${id(guildId)}/emojis/${id(emojiId)}` }),
  },
})
