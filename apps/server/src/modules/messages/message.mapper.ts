import { decodeSnowflake } from '@chinchi/shared'

import { toPublicUser } from '../users/user.mapper'

import type { UserRow } from '../users/user.repository'
import type { MessageRow } from './message.repository'
import type { Attachment, Message, MessageReply, Reaction, Snowflake } from '@chinchi/shared'

export interface MessageContext {
  /** null in DMs. */
  readonly guildId: Snowflake | null
  readonly author: UserRow | null
  readonly attachments?: readonly Attachment[] | undefined
  readonly reply?: MessageReply | null | undefined
  readonly reactions?: readonly Reaction[] | undefined
  readonly nonce?: string | undefined
  /** Who ran the command a bot's message answers. */
  readonly interactionUser?: UserRow | null
  /** Whom a group DM note is about (who was added or removed). */
  readonly systemTarget?: UserRow | null
}

export const toMessage = (
  message: MessageRow,
  {
    guildId,
    author,
    attachments = [],
    reply = null,
    reactions = [],
    nonce,
    interactionUser = null,
    systemTarget = null,
  }: MessageContext,
): Message => ({
  id: message.id,
  channelId: message.channelId,
  guildId,
  author: author ? toPublicUser(author) : null,
  webhook:
    message.webhookId !== null
      ? { id: message.webhookId, name: message.webhookName ?? 'Webhook' }
      : null,
  system: message.system
    ? {
        kind: message.system.kind,
        target: systemTarget ? toPublicUser(systemTarget) : null,
        name: message.system.name ?? null,
      }
    : null,
  interaction:
    message.interactionName !== null
      ? {
          name: message.interactionName,
          user: interactionUser ? toPublicUser(interactionUser) : null,
        }
      : null,
  content: message.content,
  ciphertext: message.ciphertext,
  createdAt: new Date(decodeSnowflake(message.id).timestamp).toISOString(),
  editedAt: message.editedAt?.toISOString() ?? null,
  attachments: [...attachments],
  reply,
  mentions: {
    users: [...message.mentionUserIds],
    roles: [...message.mentionRoleIds],
    everyone: message.mentionEveryone,
    here: message.mentionHere,
  },
  pinned: message.pinnedAt !== null,
  published: message.publishedAt !== null,
  embeds: message.embeds,
  reactions: [...reactions],
  nonce: nonce ?? null,
})
