import type { Snowflake } from '@chinchi/shared'

export type ProfileImageKind = 'avatars' | 'icons' | 'banners'

/** Object key of an avatar or server icon. A new upload gets a new id, so keys never change. */
export const profileImageKey = (kind: ProfileImageKind, ownerId: Snowflake, imageId: Snowflake) =>
  `${kind}/${ownerId}/${imageId}.webp`

/** Public API path that redirects to the image. */
export const profileImageUrl = (
  kind: ProfileImageKind,
  ownerId: Snowflake,
  imageId: Snowflake | null,
): string | null => (imageId ? `/api/v1/${kind}/${ownerId}/${imageId}.webp` : null)
