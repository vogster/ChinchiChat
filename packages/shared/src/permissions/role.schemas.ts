import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'

export const ROLE_NAME_MAX_LENGTH = 100
export const MAX_ROLE_COLOR = 0xffffff

/** A permission bit field as sent over the API: a decimal string. */
export const permissionsStringSchema = z.string().regex(/^\d{1,20}$/, 'Invalid permissions')

export const roleSchema = z.object({
  id: snowflakeSchema,
  guildId: snowflakeSchema,
  name: z.string(),
  /** 0xRRGGBB; 0 means "no color". */
  color: z.number().int().min(0).max(MAX_ROLE_COLOR),
  /** Higher is more powerful; @everyone is always 0. */
  position: z.number().int().min(0),
  permissions: permissionsStringSchema,
  /** Shown as a separate group in the member list. */
  hoist: z.boolean(),
  mentionable: z.boolean(),
})

export const overwriteTargetSchema = z.enum(['role', 'member'])

export const permissionOverwriteSchema = z.object({
  targetType: overwriteTargetSchema,
  targetId: snowflakeSchema,
  allow: permissionsStringSchema,
  deny: permissionsStringSchema,
})

const roleNameSchema = z.string().trim().min(1).max(ROLE_NAME_MAX_LENGTH)

export const createRoleRequestSchema = z.strictObject({
  name: roleNameSchema.default('new role'),
  color: z.number().int().min(0).max(MAX_ROLE_COLOR).default(0),
  permissions: permissionsStringSchema.default('0'),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
})

export const updateRoleRequestSchema = z
  .strictObject({
    name: roleNameSchema,
    color: z.number().int().min(0).max(MAX_ROLE_COLOR),
    permissions: permissionsStringSchema,
    hoist: z.boolean(),
    mentionable: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const reorderRolesRequestSchema = z
  .array(z.strictObject({ id: snowflakeSchema, position: z.number().int().min(1).max(1000) }))
  .min(1)
  .max(250)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Duplicate ids')

export const putOverwriteRequestSchema = z.strictObject({
  targetType: overwriteTargetSchema,
  allow: permissionsStringSchema,
  deny: permissionsStringSchema,
})

export type Role = z.infer<typeof roleSchema>
export type PermissionOverwrite = z.infer<typeof permissionOverwriteSchema>
export type CreateRoleRequest = z.input<typeof createRoleRequestSchema>
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>
export type ReorderRolesRequest = z.infer<typeof reorderRolesRequestSchema>
export type PutOverwriteRequest = z.infer<typeof putOverwriteRequestSchema>
