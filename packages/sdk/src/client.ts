import {
  attachmentUploadSchema,
  channelSchema,
  currentUserSchema,
  guildDetailSchema,
  guildSchema,
  instanceInfoSchema,
  mentionCountsSchema,
  inviteSchema,
  memberSchema,
  messageSchema,
  privateChannelSchema,
  auditLogEntrySchema,
  banSchema,
  voiceConnectionSchema,
  publicUserSchema,
  userProfileSchema,
  claimedKeyPackageSchema,
  customStatusSchema,
  backupEntrySchema,
  deviceApprovalSchema,
  deviceSchema,
  keyBackupSchema,
  pollSchema,
  userKeySchema,
  handshakeSchema,
  notificationSettingSchema,
  readStateSchema,
  relationshipSchema,
  roleSchema,
  sessionInfoSchema,
  loginResultSchema,
  botSchema,
  webhookSchema,
  guildEmojiSchema,
  searchResultSchema,
  automodSettingsSchema,
  reportSchema,
  adminGuildSchema,
  adminUserSchema,
  instanceInviteSchema,
  instanceSettingsSchema,
  recoveryCodesSchema,
  totpSetupSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { createAnnouncementsApi } from './announcements'
import { createCommandsApi } from './commands'
import { createHttp } from './http'
import { describeFile, putToStorage } from './upload'

import type { HttpOptions } from './http'
import type { UploadOptions } from './upload'
import type {
  UpdateBotRequest,
  CreateThreadRequest,
  SearchMessagesQuery,
  UpdateAutomodRequest,
  CreateReportRequest,
  ReportsQuery,
  AdminListQuery,
  CreateInstanceInviteRequest,
  UpdateAdminUserRequest,
  UpdateInstanceSettingsRequest,
  MfaConfirmRequest,
  MfaLoginRequest,
  BanRequest,
  ChangePasswordRequest,
  CreateAttachmentRequest,
  CreateChannelRequest,
  CreateGuildRequest,
  CreateInviteRequest,
  CreateMessageRequest,
  CreateRoleRequest,
  JoinVoiceRequest,
  ListMessagesQuery,
  LoginRequest,
  MemberVoiceRequest,
  PutOverwriteRequest,
  RegisterRequest,
  ReorderChannelsRequest,
  ReorderRolesRequest,
  Snowflake,
  TimeoutRequest,
  UpdateChannelRequest,
  UpdateGuildRequest,
  UpdateProfileRequest,
  UpdateRoleRequest,
  UpdateVoiceStateRequest,
  UpdateNotificationSettingRequest,
  SetCustomStatusRequest,
  ListHandshakesQuery,
  PostCommitRequest,
  CreateKeyBackupRequest,
  ListBackupEntriesQuery,
  RegisterDeviceRequest,
  SetUserKeyRequest,
  UploadBackupEntriesRequest,
  UploadKeyPackagesRequest,
} from '@chinchi/shared'

export { ApiError, isApiError } from './errors'
export type { ApiErrorDetail } from './errors'
export type { UploadOptions } from './upload'

const authResult = z.object({ user: currentUserSchema, token: z.string().optional() })
const userResult = z.object({ user: currentUserSchema })
const nothing = z.null()
const guildResult = z.object({ guild: guildDetailSchema })
const bareGuildResult = z.object({ guild: guildSchema })
const channelResult = z.object({ channel: channelSchema })
const inviteResult = z.object({ invite: inviteSchema })
const id = (value: string) => encodeURIComponent(value)
const messageResult = z.object({ message: messageSchema })
const relationshipResult = z.object({ relationship: relationshipSchema })
const privateChannelResult = z.object({ channel: privateChannelSchema })
const approvalResult = z.object({ approval: deviceApprovalSchema })
const reactionPath = (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
  `/channels/${id(channelId)}/messages/${id(messageId)}/reactions/${id(emoji)}`
const roleResult = z.object({ role: roleSchema })
const rolesResult = z.object({ roles: z.array(roleSchema) })
const attachmentResult = z.object({ attachment: attachmentUploadSchema })

const toQuery = (query: ListMessagesQuery): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value))
  const text = params.toString()
  return text ? `?${text}` : ''
}

const emojiResult = z.object({ emoji: guildEmojiSchema })

const searchQuery = (query: SearchMessagesQuery) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const automodResult = z.object({ automod: automodSettingsSchema })
const reportsResult = z.object({ reports: z.array(reportSchema) })
const reportResult = z.object({ report: reportSchema })

const reportsQuery = ({ status, before, limit }: ReportsQuery) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (before) params.set('before', before)
  if (limit !== undefined) params.set('limit', String(limit))
  const text = params.toString()
  return text ? `?${text}` : ''
}

const adminQuery = ({ query, before, limit }: AdminListQuery) => {
  const params = new URLSearchParams()
  if (query) params.set('query', query)
  if (before) params.set('before', before)
  if (limit !== undefined) params.set('limit', String(limit))
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const createApiClient = (options: HttpOptions) => {
  const request = createHttp(options)
  const fetch = options.fetch ?? globalThis.fetch

  const createAttachment = (channelId: Snowflake, body: CreateAttachmentRequest) =>
    request({
      method: 'POST',
      path: `/channels/${id(channelId)}/attachments`,
      body,
      data: attachmentResult,
    })

  return {
    ...createCommandsApi(request),
    ...createAnnouncementsApi(request),
    bots: {
      list: () =>
        request({ method: 'GET', path: '/bots', data: z.object({ bots: z.array(botSchema) }) }),
      /** The returned `token` signs the bot in (Bearer) and is shown only now. */
      create: (username: string) =>
        request({
          method: 'POST',
          path: '/bots',
          body: { username },
          data: z.object({ bot: botSchema, token: z.string() }),
        }),
      update: (botId: Snowflake, body: UpdateBotRequest) =>
        request({
          method: 'PATCH',
          path: `/bots/${id(botId)}`,
          body,
          data: z.object({ bot: botSchema }),
        }),
      /** A new token; the old one stops working. */
      renewToken: (botId: Snowflake) =>
        request({
          method: 'POST',
          path: `/bots/${id(botId)}/token`,
          data: z.object({ token: z.string() }),
        }),
      delete: (botId: Snowflake) => request({ method: 'DELETE', path: `/bots/${id(botId)}` }),
      addToGuild: (guildId: Snowflake, botId: Snowflake) =>
        request({ method: 'POST', path: `/guilds/${id(guildId)}/bots`, body: { botId } }),
    },
    webhooks: {
      list: (channelId: Snowflake) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/webhooks`,
          data: z.object({ webhooks: z.array(webhookSchema) }),
        }),
      /** The returned `url` holds the secret and is shown only now. */
      create: (channelId: Snowflake, name: string) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/webhooks`,
          body: { name },
          data: z.object({ webhook: webhookSchema, url: z.string() }),
        }),
      delete: (webhookId: Snowflake) =>
        request({ method: 'DELETE', path: `/webhooks/${id(webhookId)}` }),
    },
    emojis: {
      /** Uploads a server emoji; the picture is the body (PNG/JPEG/GIF/WebP, up to 512 KB). */
      create: (guildId: Snowflake, name: string, image: Blob) =>
        request({
          method: 'POST',
          path: `/guilds/${id(guildId)}/emojis?name=${encodeURIComponent(name)}`,
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
    search: {
      /** Messages of a server, in the channels the user may read. */
      guild: (guildId: Snowflake, query: SearchMessagesQuery) =>
        request({
          method: 'GET',
          path: `/guilds/${id(guildId)}/messages/search${searchQuery(query)}`,
          data: searchResultSchema,
        }),
      /** Messages of one channel (a DM included). */
      channel: (channelId: Snowflake, query: SearchMessagesQuery) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/messages/search${searchQuery(query)}`,
          data: searchResultSchema,
        }),
    },
    automod: {
      get: (guildId: Snowflake) =>
        request({ method: 'GET', path: `/guilds/${id(guildId)}/automod`, data: automodResult }),
      update: (guildId: Snowflake, body: UpdateAutomodRequest) =>
        request({
          method: 'PATCH',
          path: `/guilds/${id(guildId)}/automod`,
          body,
          data: automodResult,
        }),
    },
    reports: {
      create: (channelId: Snowflake, messageId: Snowflake, body: CreateReportRequest) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}/report`,
          body,
        }),
      /** A server's reports, for moderators (MANAGE_MESSAGES). */
      guild: (guildId: Snowflake, query: ReportsQuery = {}) =>
        request({
          method: 'GET',
          path: `/guilds/${id(guildId)}/reports${reportsQuery(query)}`,
          data: reportsResult,
        }),
      closeGuild: (guildId: Snowflake, reportId: Snowflake, status: 'resolved' | 'dismissed') =>
        request({
          method: 'PATCH',
          path: `/guilds/${id(guildId)}/reports/${id(reportId)}`,
          body: { status },
          data: reportResult,
        }),
      /** Reports of direct messages, for instance admins. */
      direct: (query: ReportsQuery = {}) =>
        request({
          method: 'GET',
          path: `/admin/reports${reportsQuery(query)}`,
          data: reportsResult,
        }),
      closeDirect: (reportId: Snowflake, status: 'resolved' | 'dismissed') =>
        request({
          method: 'PATCH',
          path: `/admin/reports/${id(reportId)}`,
          body: { status },
          data: reportResult,
        }),
    },
    /** Instance administration; every call answers 403 `NOT_ADMIN` to other users. */
    admin: {
      settings: () =>
        request({
          method: 'GET',
          path: '/admin/settings',
          data: z.object({ settings: instanceSettingsSchema }),
        }),
      updateSettings: (body: UpdateInstanceSettingsRequest) =>
        request({
          method: 'PATCH',
          path: '/admin/settings',
          body,
          data: z.object({ settings: instanceSettingsSchema }),
        }),
      users: (query: AdminListQuery = {}) =>
        request({
          method: 'GET',
          path: `/admin/users${adminQuery(query)}`,
          data: z.object({ users: z.array(adminUserSchema) }),
        }),
      updateUser: (userId: Snowflake, body: UpdateAdminUserRequest) =>
        request({
          method: 'PATCH',
          path: `/admin/users/${id(userId)}`,
          body,
          data: z.object({ user: adminUserSchema }),
        }),
      guilds: (query: AdminListQuery = {}) =>
        request({
          method: 'GET',
          path: `/admin/guilds${adminQuery(query)}`,
          data: z.object({ guilds: z.array(adminGuildSchema) }),
        }),
      deleteGuild: (guildId: Snowflake) =>
        request({ method: 'DELETE', path: `/admin/guilds/${id(guildId)}` }),
      /** Deletes someone's account and the servers it owns. */
      deleteUser: (userId: Snowflake) =>
        request({ method: 'DELETE', path: `/admin/users/${id(userId)}` }),
      invites: () =>
        request({
          method: 'GET',
          path: '/admin/invites',
          data: z.object({ invites: z.array(instanceInviteSchema) }),
        }),
      createInvite: (body: CreateInstanceInviteRequest = {}) =>
        request({
          method: 'POST',
          path: '/admin/invites',
          body,
          data: z.object({ invite: instanceInviteSchema }),
        }),
      revokeInvite: (code: string) =>
        request({ method: 'DELETE', path: `/admin/invites/${encodeURIComponent(code)}` }),
    },
    mfa: {
      setup: (password: string) =>
        request({
          method: 'POST',
          path: '/users/@me/mfa/totp/setup',
          body: { password },
          data: totpSetupSchema,
        }),
      /** Confirms the app with a code; the recovery codes come back only now. */
      enable: (code: string) =>
        request({
          method: 'POST',
          path: '/users/@me/mfa/totp/enable',
          body: { code },
          data: recoveryCodesSchema,
        }),
      disable: (body: MfaConfirmRequest) =>
        request({ method: 'POST', path: '/users/@me/mfa/disable', body, data: nothing }),
      renewRecoveryCodes: (body: MfaConfirmRequest) =>
        request({
          method: 'POST',
          path: '/users/@me/mfa/recovery-codes',
          body,
          data: recoveryCodesSchema,
        }),
    },
    auth: {
      register: (body: RegisterRequest) =>
        request({ method: 'POST', path: '/auth/register', body, data: authResult }),
      /** Either signs in, or returns `mfaTicket` for `loginMfa` (2FA accounts). */
      login: (body: LoginRequest) =>
        request({ method: 'POST', path: '/auth/login', body, data: loginResultSchema }),
      loginMfa: (body: MfaLoginRequest) =>
        request({ method: 'POST', path: '/auth/login/mfa', body, data: authResult }),
      logout: () => request({ method: 'POST', path: '/auth/logout' }),
      verifyEmail: (token: string) =>
        request({ method: 'POST', path: '/auth/verify-email', body: { token }, data: userResult }),
      resendVerification: () =>
        request({ method: 'POST', path: '/auth/verify-email/resend', data: nothing }),
      forgotPassword: (email: string) =>
        request({ method: 'POST', path: '/auth/password/forgot', body: { email }, data: nothing }),
      changePassword: (body: ChangePasswordRequest) =>
        request({ method: 'POST', path: '/auth/password/change', body, data: nothing }),
      resetPassword: (token: string, password: string) =>
        request({
          method: 'POST',
          path: '/auth/password/reset',
          body: { token, password },
          data: nothing,
        }),
    },
    sessions: {
      list: () =>
        request({
          method: 'GET',
          path: '/auth/sessions',
          data: z.object({ sessions: z.array(sessionInfoSchema) }),
        }),
      revoke: (id: Snowflake) =>
        request({ method: 'DELETE', path: `/auth/sessions/${encodeURIComponent(id)}` }),
      revokeOthers: () => request({ method: 'DELETE', path: '/auth/sessions' }),
    },
    users: {
      me: () => request({ method: 'GET', path: '/users/@me', data: userResult }),
      updateMe: (body: UpdateProfileRequest) =>
        request({ method: 'PATCH', path: '/users/@me', body, data: userResult }),
      /** Deletes the signed-in account for good; messages stay as a deleted user's. */
      deleteMe: (password: string, code?: string) =>
        request({
          method: 'DELETE',
          path: '/users/@me',
          body: { password, ...(code ? { code } : {}) },
        }),
      /** PNG, JPEG, GIF or WebP up to PROFILE_IMAGE_MAX_BYTES; stored as a square crop. */
      setAvatar: (image: Blob) =>
        request({ method: 'PUT', path: '/users/@me/avatar', body: image, data: userResult }),
      clearAvatar: () => request({ method: 'DELETE', path: '/users/@me/avatar', data: userResult }),
      /** Same formats as avatars; stored as a wide 3:1 strip. */
      setBanner: (image: Blob) =>
        request({ method: 'PUT', path: '/users/@me/banner', body: image, data: userResult }),
      clearBanner: () => request({ method: 'DELETE', path: '/users/@me/banner', data: userResult }),
      /** A line under my name, shown to others while I am not invisible. */
      setCustomStatus: (body: SetCustomStatusRequest) =>
        request({
          method: 'PUT',
          path: '/users/@me/custom-status',
          body,
          data: z.object({ customStatus: customStatusSchema }),
        }),
      clearCustomStatus: () => request({ method: 'DELETE', path: '/users/@me/custom-status' }),
      /** Someone's profile; `guildId` adds their membership in that server (roles, nickname). */
      profile: (userId: Snowflake, guildId?: Snowflake) =>
        request({
          method: 'GET',
          path: `/users/${id(userId)}/profile${guildId ? `?guildId=${id(guildId)}` : ''}`,
          data: z.object({ profile: userProfileSchema }),
        }),
    },
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
    messages: {
      list: (channelId: Snowflake, query: ListMessagesQuery = {}) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/messages${toQuery(query)}`,
          data: z.object({ messages: z.array(messageSchema) }),
        }),
      create: (channelId: Snowflake, body: CreateMessageRequest) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/messages`,
          body,
          data: messageResult,
        }),
      /** New text, or in an encrypted conversation `{ ciphertext }`. */
      update: (
        channelId: Snowflake,
        messageId: Snowflake,
        change: string | { readonly ciphertext: string },
      ) =>
        request({
          method: 'PATCH',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}`,
          body: typeof change === 'string' ? { content: change } : change,
          data: messageResult,
        }),
      delete: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'DELETE', path: `/channels/${id(channelId)}/messages/${id(messageId)}` }),
      ack: (channelId: Snowflake, messageId: Snowflake) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}/ack`,
        }),
      typing: (channelId: Snowflake) =>
        request({ method: 'POST', path: `/channels/${id(channelId)}/typing` }),
      readStates: () =>
        request({
          method: 'GET',
          path: '/users/@me/read-states',
          data: z.object({
            readStates: z.array(readStateSchema),
            mentionCounts: mentionCountsSchema,
          }),
        }),
    },
    /** Encrypted conversations: devices, key packages and the MLS delivery service. */
    e2ee: {
      myDevices: () =>
        request({
          method: 'GET',
          path: '/users/@me/devices',
          data: z.object({ devices: z.array(deviceSchema) }),
        }),
      devicesOf: (userId: Snowflake) =>
        request({
          method: 'GET',
          path: `/users/${id(userId)}/devices`,
          data: z.object({ devices: z.array(deviceSchema) }),
        }),
      registerDevice: (body: RegisterDeviceRequest) =>
        request({
          method: 'POST',
          path: '/users/@me/devices',
          body,
          data: z.object({ device: deviceSchema }),
        }),
      deleteDevice: (deviceId: Snowflake) =>
        request({ method: 'DELETE', path: `/users/@me/devices/${id(deviceId)}` }),
      /** A user's own key (cross-signing), or null before their first device sets one. */
      userKey: (userId: Snowflake | '@me') =>
        request({
          method: 'GET',
          path: `/users/${userId === '@me' ? '@me' : id(userId)}/e2ee/user-key`,
          data: z.object({ userKey: userKeySchema.nullable() }),
        }),
      setUserKey: (body: SetUserKeyRequest) =>
        request({
          method: 'PUT',
          path: '/users/@me/e2ee/user-key',
          body,
          data: z.object({ userKey: userKeySchema }),
        }),
      /** My history backup (the user key encrypted for the recovery key), or null. */
      backup: () =>
        request({
          method: 'GET',
          path: '/users/@me/e2ee/backup',
          data: z.object({ backup: keyBackupSchema.nullable() }),
        }),
      createBackup: (body: CreateKeyBackupRequest) =>
        request({
          method: 'PUT',
          path: '/users/@me/e2ee/backup',
          body,
          data: z.object({ backup: keyBackupSchema }),
        }),
      putBackupEntries: (body: UploadBackupEntriesRequest) =>
        request({ method: 'POST', path: '/users/@me/e2ee/backup/entries', body }),
      backupEntries: ({ channelId, after, limit }: ListBackupEntriesQuery) =>
        request({
          method: 'GET',
          path: `/users/@me/e2ee/backup/entries?${new URLSearchParams({
            channelId,
            ...(after ? { after } : {}),
            ...(limit ? { limit: String(limit) } : {}),
          }).toString()}`,
          data: z.object({ entries: z.array(backupEntrySchema) }),
        }),
      /** Approving a new device from an approved one (see `DeviceApproval`). */
      approvals: {
        request: (body: { deviceId: Snowflake; commitment: string }) =>
          request({
            method: 'POST',
            path: '/users/@me/e2ee/approvals',
            body,
            data: approvalResult,
          }),
        get: (approvalId: Snowflake) =>
          request({
            method: 'GET',
            path: `/users/@me/e2ee/approvals/${id(approvalId)}`,
            data: approvalResult,
          }),
        accept: (approvalId: Snowflake, body: { deviceId: Snowflake; publicKey: string }) =>
          request({
            method: 'POST',
            path: `/users/@me/e2ee/approvals/${id(approvalId)}/accept`,
            body,
            data: approvalResult,
          }),
        reveal: (approvalId: Snowflake, publicKey: string) =>
          request({
            method: 'POST',
            path: `/users/@me/e2ee/approvals/${id(approvalId)}/reveal`,
            body: { publicKey },
            data: approvalResult,
          }),
        complete: (approvalId: Snowflake, secrets: string) =>
          request({
            method: 'POST',
            path: `/users/@me/e2ee/approvals/${id(approvalId)}/complete`,
            body: { secrets },
            data: approvalResult,
          }),
        decline: (approvalId: Snowflake) =>
          request({ method: 'DELETE', path: `/users/@me/e2ee/approvals/${id(approvalId)}` }),
      },
      /** Vouches for one of my devices with my user key. */
      signDevice: (deviceId: Snowflake, signature: string) =>
        request({
          method: 'PUT',
          path: `/users/@me/devices/${id(deviceId)}/signature`,
          body: { signature },
        }),
      uploadKeyPackages: (deviceId: Snowflake, body: UploadKeyPackagesRequest) =>
        request({ method: 'POST', path: `/users/@me/devices/${id(deviceId)}/key-packages`, body }),
      countKeyPackages: (deviceId: Snowflake) =>
        request({
          method: 'GET',
          path: `/users/@me/devices/${id(deviceId)}/key-packages/count`,
          data: z.object({ count: z.number().int() }),
        }),
      /** One key package of each of the user's devices, used up by the claim. */
      claimKeyPackages: (userId: Snowflake) =>
        request({
          method: 'POST',
          path: `/users/${id(userId)}/key-packages/claim`,
          data: z.object({ keyPackages: z.array(claimedKeyPackageSchema) }),
        }),
      /** Fails with STALE_EPOCH when another commit took that epoch first. */
      postCommit: (channelId: Snowflake, body: PostCommitRequest) =>
        request({ method: 'POST', path: `/channels/${id(channelId)}/e2ee/commits`, body }),
      handshakes: (channelId: Snowflake, query: ListHandshakesQuery) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/e2ee/handshakes?${new URLSearchParams({
            deviceId: query.deviceId,
            ...(query.after ? { after: query.after } : {}),
          }).toString()}`,
          data: z.object({ handshakes: z.array(handshakeSchema) }),
        }),
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
    moderation: {
      kick: (guildId: Snowflake, userId: Snowflake, reason?: string) =>
        request({
          method: 'POST',
          path: `/guilds/${id(guildId)}/members/${id(userId)}/kick`,
          body: reason ? { reason } : {},
        }),
      /** Bans (also someone who already left); their recent messages may be deleted too. */
      ban: (guildId: Snowflake, userId: Snowflake, body: BanRequest = {}) =>
        request({ method: 'PUT', path: `/guilds/${id(guildId)}/bans/${id(userId)}`, body }),
      unban: (guildId: Snowflake, userId: Snowflake) =>
        request({ method: 'DELETE', path: `/guilds/${id(guildId)}/bans/${id(userId)}` }),
      bans: (guildId: Snowflake) =>
        request({
          method: 'GET',
          path: `/guilds/${id(guildId)}/bans`,
          data: z.object({ bans: z.array(banSchema) }),
        }),
      /** `until: null` lifts the timeout. */
      timeout: (guildId: Snowflake, userId: Snowflake, body: TimeoutRequest) =>
        request({
          method: 'PATCH',
          path: `/guilds/${id(guildId)}/members/${id(userId)}/timeout`,
          body,
        }),
      /** Newest first; pass the last entry's id as `before` for older ones. */
      auditLog: (
        guildId: Snowflake,
        { before, limit }: { before?: Snowflake; limit?: number } = {},
      ) => {
        const query = new URLSearchParams()
        if (before) query.set('before', before)
        if (limit) query.set('limit', String(limit))
        const suffix = query.size > 0 ? `?${query}` : ''
        return request({
          method: 'GET',
          path: `/guilds/${id(guildId)}/audit-log${suffix}`,
          data: z.object({ entries: z.array(auditLogEntrySchema) }),
        })
      },
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
    dms: {
      list: () =>
        request({
          method: 'GET',
          path: '/users/@me/channels',
          data: z.object({ channels: z.array(privateChannelSchema) }),
        }),
      /** One recipient opens (or finds) the 1:1 DM; several start a group with friends. */
      /** `encrypted` opens the encrypted conversation with that person (started if missing). */
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
    pins: {
      list: (channelId: Snowflake) =>
        request({
          method: 'GET',
          path: `/channels/${id(channelId)}/pins`,
          data: z.object({ messages: z.array(messageSchema) }),
        }),
      pin: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'PUT', path: `/channels/${id(channelId)}/pins/${id(messageId)}` }),
      unpin: (channelId: Snowflake, messageId: Snowflake) =>
        request({ method: 'DELETE', path: `/channels/${id(channelId)}/pins/${id(messageId)}` }),
    },
    polls: {
      /** My answers, replacing earlier ones (none takes my vote back). */
      vote: (channelId: Snowflake, messageId: Snowflake, answerIds: readonly number[]) =>
        request({
          method: 'PUT',
          path: `/channels/${id(channelId)}/polls/${id(messageId)}/answers/@me`,
          body: { answerIds: [...answerIds] },
          data: z.object({ poll: pollSchema }),
        }),
      /** Its author ends a poll early. */
      end: (channelId: Snowflake, messageId: Snowflake) =>
        request({
          method: 'POST',
          path: `/channels/${id(channelId)}/polls/${id(messageId)}/expire`,
          data: z.object({ poll: pollSchema }),
        }),
    },
    reactions: {
      /** Encrypted conversations: my whole set, encrypted (null takes them all back). */
      setEncrypted: (channelId: Snowflake, messageId: Snowflake, ciphertext: string | null) =>
        request({
          method: ciphertext ? 'PUT' : 'DELETE',
          path: `/channels/${id(channelId)}/messages/${id(messageId)}/e2ee-reactions/@me`,
          ...(ciphertext ? { body: { ciphertext } } : {}),
        }),
      add: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({ method: 'PUT', path: `${reactionPath(channelId, messageId, emoji)}/@me` }),
      remove: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({ method: 'DELETE', path: `${reactionPath(channelId, messageId, emoji)}/@me` }),
      /** Someone else's reaction (MANAGE_MESSAGES). */
      removeOf: (channelId: Snowflake, messageId: Snowflake, emoji: string, userId: Snowflake) =>
        request({
          method: 'DELETE',
          path: `${reactionPath(channelId, messageId, emoji)}/${id(userId)}`,
        }),
      users: (channelId: Snowflake, messageId: Snowflake, emoji: string) =>
        request({
          method: 'GET',
          path: reactionPath(channelId, messageId, emoji),
          data: z.object({ users: z.array(publicUserSchema) }),
        }),
    },
    attachments: {
      create: createAttachment,
      /** Uploads a file for a message in the channel; resolves to the id for `attachmentIds`. */
      async upload(channelId: Snowflake, file: Blob, options?: UploadOptions): Promise<Snowflake> {
        const { attachment } = await createAttachment(channelId, describeFile(file, options))
        await putToStorage(fetch, attachment, file)
        return attachment.id
      },
    },
    instance: {
      get: () =>
        request({
          method: 'GET',
          path: '/instance',
          data: z.object({ instance: instanceInfoSchema }),
        }),
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
