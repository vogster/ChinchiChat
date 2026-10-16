import { replySnippetText } from '@chinchi/shared'

import { groupByMessage } from '../attachments/attachment.mapper'
import { toPublicUser } from '../users/user.mapper'
import { toMessage } from './message.mapper'

import type { UserRepository } from '../users/user.repository'
import type { AttachmentRepository } from '../attachments/attachment.repository'
import type { MessageRepository, MessageWithAuthor } from './message.repository'
import type { PollRepository } from './poll.repository'
import type { ReactionRepository } from './reaction.repository'
import type { Message, MessageReply, Poll, Snowflake } from '@chinchi/shared'

export interface MessageViewsDeps {
  readonly messages: MessageRepository
  readonly attachmentRows: AttachmentRepository
  readonly reactions: ReactionRepository
  /** Polls sent with messages; absent where nothing can carry one. */
  readonly polls?: Pick<PollRepository, 'summaries'> | undefined
  /** People who ran the commands bot messages answer. */
  readonly users: Pick<UserRepository, 'findByIds'>
}

export interface BuildOptions {
  readonly nonce?: string | undefined
  /** Whose `me` the reactions show; null for copies broadcast to everyone. */
  readonly viewerId?: Snowflake | null | undefined
}

/** Turns message rows into API messages, loading attachments and reply snippets in batches. */
export const createMessageViews = ({
  messages,
  attachmentRows,
  reactions,
  polls,
  users,
}: MessageViewsDeps) => {
  const repliesFor = async (channelId: Snowflake, rows: readonly MessageWithAuthor[]) => {
    const ids = [...new Set(rows.flatMap(({ message }) => message.replyToId ?? []))]
    if (ids.length === 0) return new Map<Snowflake, MessageReply['message']>()
    const [originals, counts] = await Promise.all([
      messages.findManyInChannel(channelId, ids),
      attachmentRows.countByMessages(ids),
    ])
    const found = new Map(originals.map((original) => [original.message.id, original]))
    return new Map<Snowflake, MessageReply['message']>(
      ids.map((id) => {
        const original = found.get(id)
        return [
          id,
          original
            ? {
                author: original.author ? toPublicUser(original.author) : null,
                content: replySnippetText(original.message.content),
                attachmentCount: counts.get(id) ?? 0,
              }
            : null,
        ]
      }),
    )
  }

  /** Messages of one channel, in the given order. */
  const build = async (
    channelId: Snowflake,
    guildId: Snowflake | null,
    rows: readonly MessageWithAuthor[],
    { nonce, viewerId = null }: BuildOptions = {},
  ): Promise<Message[]> => {
    const ids = rows.map(({ message }) => message.id)
    // People named by the messages: who ran a bot command, whom a group note is about.
    const interactionUserIds = [
      ...new Set(
        rows.flatMap(({ message }) => [
          ...(message.interactionUserId ? [message.interactionUserId] : []),
          ...(message.system?.targetId ? [message.system.targetId] : []),
          ...(message.forward?.authorId ? [message.forward.authorId] : []),
        ]),
      ),
    ]
    const encryptedIds = rows
      .filter(({ message }) => message.ciphertext)
      .map(({ message }) => message.id)
    const [files, replies, reactionsByMessage, interactionUsers, encryptedByMessage] =
      await Promise.all([
        attachmentRows.listByMessages(ids),
        repliesFor(channelId, rows),
        reactions.summaries(ids, viewerId),
        interactionUserIds.length > 0 ? users.findByIds(interactionUserIds) : [],
        reactions.encryptedFor(encryptedIds),
      ])
    const pollsByMessage = polls ? await polls.summaries(ids, viewerId) : new Map<Snowflake, Poll>()
    const usersById = new Map(interactionUsers.map((user) => [user.id, user]))
    const filesByMessage = groupByMessage(files)
    return rows.map(({ message, author }) =>
      toMessage(message, {
        guildId,
        author,
        attachments: filesByMessage.get(message.id),
        reply: message.replyToId
          ? {
              messageId: message.replyToId,
              mentionsAuthor: message.replyMention,
              message: replies.get(message.replyToId) ?? null,
            }
          : null,
        reactions: reactionsByMessage.get(message.id),
        encryptedReactions: encryptedByMessage.get(message.id),
        poll: pollsByMessage.get(message.id) ?? null,
        forwardAuthor: message.forward?.authorId
          ? (usersById.get(message.forward.authorId) ?? null)
          : null,
        nonce,
        interactionUser: message.interactionUserId
          ? (usersById.get(message.interactionUserId) ?? null)
          : null,
        systemTarget: message.system?.targetId
          ? (usersById.get(message.system.targetId) ?? null)
          : null,
      }),
    )
  }

  return {
    build,
    async one(
      channelId: Snowflake,
      guildId: Snowflake | null,
      row: MessageWithAuthor,
      options?: BuildOptions,
    ): Promise<Message> {
      const [message] = await build(channelId, guildId, [row], options)
      return message as Message
    },
  }
}

export type MessageViews = ReturnType<typeof createMessageViews>
