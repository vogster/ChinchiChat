import {
  adminGuildSchema,
  adminUserSchema,
  auditLogEntrySchema,
  automodSettingsSchema,
  banSchema,
  instanceInviteSchema,
  instanceSettingsSchema,
  reportSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { id, queryString } from './url'

import type { Http } from './http'
import type {
  AdminListQuery,
  BanRequest,
  CreateInstanceInviteRequest,
  CreateReportRequest,
  ReportsQuery,
  Snowflake,
  TimeoutRequest,
  UpdateAdminUserRequest,
  UpdateAutomodRequest,
  UpdateInstanceSettingsRequest,
} from '@chinchi/shared'

const automodResult = z.object({ automod: automodSettingsSchema })
const reportsResult = z.object({ reports: z.array(reportSchema) })
const reportResult = z.object({ report: reportSchema })

/** Keeping order: instance administration, server moderation, reports and automod. */
export const createAdminApi = (request: Http) => ({
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
        path: `/admin/users${queryString(query)}`,
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
        path: `/admin/guilds${queryString(query)}`,
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
      request({ method: 'DELETE', path: `/admin/invites/${id(code)}` }),
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
    auditLog: (guildId: Snowflake, query: { before?: Snowflake; limit?: number } = {}) =>
      request({
        method: 'GET',
        path: `/guilds/${id(guildId)}/audit-log${queryString(query)}`,
        data: z.object({ entries: z.array(auditLogEntrySchema) }),
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
        path: `/guilds/${id(guildId)}/reports${queryString(query)}`,
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
        path: `/admin/reports${queryString(query)}`,
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
})
