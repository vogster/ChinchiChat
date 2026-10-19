import { z } from 'zod'

export const ADMIN_SECTIONS = ['users', 'guilds', 'reports', 'instance'] as const

export type AdminSection = (typeof ADMIN_SECTIONS)[number]

export const isAdminSection = (value: string): value is AdminSection =>
  (ADMIN_SECTIONS as readonly string[]).includes(value)

/**
 * The instance administration opens over the page (`?admin=users`), like the user's and a
 * server's settings, so the chat behind keeps its connection and a voice call.
 */
export const adminSearchSchema = z.object({
  admin: z.enum(ADMIN_SECTIONS).optional().catch(undefined),
})

export type AdminSearch = z.infer<typeof adminSearchSchema>

/**
 * Search params that open (or switch, or with undefined close) the administration. It takes the
 * place of the user settings it is opened from.
 */
export const withAdmin =
  (admin: AdminSection | undefined) =>
  (prev: Record<string, unknown>): never => {
    const { admin: _, settings: __, ...rest } = prev
    return (admin ? { ...rest, admin } : rest) as never
  }
