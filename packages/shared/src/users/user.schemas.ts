import { z } from 'zod'

import { displayNameSchema, localeSchema } from '../auth/auth.schemas'
import { snowflakeSchema } from '../snowflake/snowflake'

/** Profile pictures and server icons: uploaded as one image, stored as a square WebP. */
export const PROFILE_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const PROFILE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

/** What any user can see about another user. */
export const publicUserSchema = z.object({
  id: snowflakeSchema,
  username: z.string(),
  displayName: z.string().nullable(),
  /** API path of the avatar (public, cacheable); null shows a placeholder. */
  avatarUrl: z.string().nullable(),
  /** A bot account (present only when true). */
  bot: z.literal(true).optional(),
})

/** Who may send you DMs: friends and people you share a server with, or friends only. */
export const dmPolicySchema = z.enum(['servers', 'friends'])

/** The signed-in user's own account, including private fields. */
export const currentUserSchema = publicUserSchema.extend({
  email: z.string(),
  emailVerified: z.boolean(),
  dmPolicy: dmPolicySchema,
  locale: localeSchema,
  /** "About me"; null when empty. */
  bio: z.string().nullable(),
  /** Whether signing in also asks for an authenticator code. */
  mfaEnabled: z.boolean(),
  /** Runs this instance: sees the admin panel. */
  isAdmin: z.boolean(),
  createdAt: z.iso.datetime(),
  bannerUrl: z.string().nullable(),
  accentColor: z.number().int().nullable(),
})

export type Locale = z.infer<typeof localeSchema>
export type PublicUser = z.infer<typeof publicUserSchema>
export type CurrentUser = z.infer<typeof currentUserSchema>
export type DmPolicy = z.infer<typeof dmPolicySchema>

/** Only the given fields change; `displayName: null` clears it (the username is shown instead). */
export const accentColorSchema = z.number().int().min(0).max(0xffffff)

export const updateProfileRequestSchema = z
  .strictObject({
    displayName: displayNameSchema.nullable().optional(),
    // Kept here (not imported from profile.schemas) to avoid an import cycle.
    bio: z.string().trim().max(190).nullable().optional(),
    dmPolicy: dmPolicySchema.optional(),
    /** The language of emails: the web sends it when the user switches the app's language. */
    locale: localeSchema.optional(),
    /** The profile's colour (0xRRGGBB), shown when there is no banner; null resets it. */
    accentColor: accentColorSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>
