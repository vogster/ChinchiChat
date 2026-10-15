import type { PrivateChannel, PublicUser } from '@chinchi/shared'
import type { TFunction } from 'i18next'

export const userName = (user: PublicUser) => user.displayName ?? user.username

/** A 1:1 DM is named after the other person; a group by its name or its members. */
export const privateChannelName = (t: TFunction, channel: PrivateChannel) => {
  if (channel.name) return channel.name
  if (channel.recipients.length === 0) return t('dm.emptyGroup')
  return channel.recipients.map(userName).join(', ')
}
