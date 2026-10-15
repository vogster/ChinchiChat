import { toPublicUser } from '../users/user.mapper'

import type { AnyChannelRow } from '../channels/channel.repository'
import type { UserRow } from '../users/user.repository'
import type { PrivateChannel, Snowflake } from '@chinchi/shared'

/** A DM as one of its members sees it: the others are its recipients. */
export const toPrivateChannel = (
  channel: AnyChannelRow,
  members: readonly UserRow[],
  viewerId: Snowflake,
): PrivateChannel => ({
  id: channel.id,
  type: channel.type === 'group_dm' ? 'group_dm' : 'dm',
  name: channel.type === 'group_dm' && channel.name ? channel.name : null,
  ownerId: channel.ownerId,
  recipients: members.filter((user) => user.id !== viewerId).map(toPublicUser),
  lastMessageId: channel.lastMessageId,
  encrypted: channel.encrypted,
})
