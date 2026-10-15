import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'
import { registrationModeSchema } from './instance.schemas'

/** Codes for joining the instance (not a server) while registration is by invite. */
export const instanceInviteCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{8,32}$/, 'Invalid invite code')

export const MAX_GUILDS_PER_USER_LIMIT = 1000

/** What instance admins can change at runtime (environment variables give the defaults). */
export const instanceSettingsSchema = z.object({
  registrationMode: registrationModeSchema,
  /** Servers one person may own; null means no limit. */
  maxGuildsPerUser: z.number().int().positive().nullable(),
})

export const updateInstanceSettingsRequestSchema = z
  .strictObject({
    registrationMode: registrationModeSchema.optional(),
    maxGuildsPerUser: z.number().int().min(1).max(MAX_GUILDS_PER_USER_LIMIT).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

/** Admin lists: newest first, optionally filtered by a name (or email) fragment. */
export const adminListQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  before: snowflakeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const adminUserSchema = z.object({
  user: publicUserSchema,
  email: z.string(),
  isAdmin: z.boolean(),
  suspended: z.boolean(),
  mfaEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
})

export const updateAdminUserRequestSchema = z
  .strictObject({
    /** Suspended accounts can't sign in; their sessions end. */
    suspended: z.boolean().optional(),
    admin: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const adminGuildSchema = z.object({
  id: snowflakeSchema,
  name: z.string(),
  iconUrl: z.string().nullable(),
  owner: publicUserSchema.nullable(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
})

export const instanceInviteSchema = z.object({
  code: z.string(),
  uses: z.number().int().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdBy: publicUserSchema.nullable(),
  createdAt: z.iso.datetime(),
})

export const createInstanceInviteRequestSchema = z.strictObject({
  maxUses: z.number().int().min(1).max(1000).nullable().default(1),
  /** Null: never expires. */
  expiresInSeconds: z
    .number()
    .int()
    .min(3600)
    .max(30 * 86_400)
    .nullable()
    .default(7 * 86_400),
})

export type InstanceSettings = z.infer<typeof instanceSettingsSchema>
export type UpdateInstanceSettingsRequest = z.infer<typeof updateInstanceSettingsRequestSchema>
export type AdminListQuery = z.input<typeof adminListQuerySchema>
export type AdminUser = z.infer<typeof adminUserSchema>
export type UpdateAdminUserRequest = z.infer<typeof updateAdminUserRequestSchema>
export type AdminGuild = z.infer<typeof adminGuildSchema>
export type InstanceInvite = z.infer<typeof instanceInviteSchema>
export type CreateInstanceInviteRequest = z.input<typeof createInstanceInviteRequestSchema>
