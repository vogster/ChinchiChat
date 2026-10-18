import { z } from 'zod'

import { SERVER_SETTINGS_SECTIONS } from './sections'

import type { ServerSettingsSection } from './sections'

/**
 * A server's settings open over the chat (`?serverSettings=<server>&serverSection=roles`), like
 * the user's, so the chat behind keeps its connection and a voice call. Without a section the
 * first one the user may open is shown.
 */
export const serverSettingsSearchSchema = z.object({
  serverSettings: z.coerce
    .string()
    .regex(/^\d{1,20}$/)
    .optional()
    .catch(undefined),
  serverSection: z.enum(SERVER_SETTINGS_SECTIONS).optional().catch(undefined),
})

export type ServerSettingsSearch = z.infer<typeof serverSettingsSearchSchema>

/** Search params that open (or switch, or with undefined close) a server's settings. */
export const withServerSettings =
  (guildId: string | undefined, section?: ServerSettingsSection) =>
  (prev: Record<string, unknown>): never => {
    const { serverSettings: _, serverSection: __, ...rest } = prev
    if (!guildId) return rest as never
    return {
      ...rest,
      serverSettings: guildId,
      ...(section ? { serverSection: section } : {}),
    } as never
  }
