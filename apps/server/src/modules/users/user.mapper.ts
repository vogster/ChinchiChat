import { profileImageUrl } from '../media/media-paths'

import type { UserRow } from './user.repository'
import type { CurrentUser, PublicUser } from '@chinchi/shared'

export const toPublicUser = (user: UserRow): PublicUser => ({
  ...(user.isBot ? { bot: true } : {}),
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  avatarUrl: profileImageUrl('avatars', user.id, user.avatarId),
})

export const toCurrentUser = (user: UserRow): CurrentUser => ({
  ...toPublicUser(user),
  email: user.email,
  emailVerified: user.emailVerifiedAt !== null,
  dmPolicy: user.dmPolicy,
  locale: user.locale === 'en' ? 'en' : 'ru',
  bio: user.bio,
  mfaEnabled: user.totpSecret !== null,
  isAdmin: user.isAdmin,
  createdAt: user.createdAt.toISOString(),
  bannerUrl: profileImageUrl('banners', user.id, user.bannerId),
  accentColor: user.accentColor,
})
