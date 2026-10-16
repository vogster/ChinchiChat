import { z } from 'zod'

import { CIPHERTEXT_MAX_BASE64, base64Schema } from '../e2ee/e2ee.schemas'
import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'
import { ATTACHMENTS_PER_MESSAGE_MAX, attachmentSchema } from './attachment.schemas'
import { createPollSchema, pollSchema } from './poll.schemas'
import { encryptedReactionSchema, reactionSchema } from './reaction.schemas'

export const MESSAGE_MAX_LENGTH = 2000
export const MESSAGES_PAGE_MAX = 100
/** Links in one message that get a preview. */
export const LINK_PREVIEWS_PER_MESSAGE = 3
/** Pinned messages one channel can hold. */
export const PINS_PER_CHANNEL_MAX = 50
/** How much of the replied-to message travels with a reply. */
export const REPLY_SNIPPET_LENGTH = 200

/** The start of a replied-to message, cut at a code point so emoji are never split. */
export const replySnippetText = (content: string): string =>
  Array.from(content).slice(0, REPLY_SNIPPET_LENGTH).join('')

/** Surrounding whitespace is dropped; whitespace-only messages are not messages. */
export const messageContentSchema = z.string().trim().min(1).max(MESSAGE_MAX_LENGTH)

export const createMessageRequestSchema = z
  .strictObject({
    /** May be empty when files are attached. */
    content: z.string().trim().max(MESSAGE_MAX_LENGTH).default(''),
    /** Uploaded, not yet sent attachments of the author in this channel. */
    attachmentIds: z
      .array(snowflakeSchema)
      .max(ATTACHMENTS_PER_MESSAGE_MAX)
      .refine((ids) => new Set(ids).size === ids.length, 'Duplicate attachment')
      .optional(),
    /** A message in the same channel this one answers. */
    replyTo: snowflakeSchema.optional(),
    /** Whether the reply notifies the replied-to author (default: yes). */
    replyMention: z.boolean().optional(),
    /** Client-chosen id echoed back in MESSAGE_CREATE, to reconcile optimistic sends. */
    nonce: z.string().min(1).max(64).optional(),
    /** Encrypted conversations: the MLS message, base64; then `content` stays empty. */
    ciphertext: base64Schema(CIPHERTEXT_MAX_BASE64).optional(),
    /** A poll with the message (it can be the whole message). */
    poll: createPollSchema.optional(),
  })
  .refine(
    (body) =>
      body.content.length > 0 ||
      (body.attachmentIds?.length ?? 0) > 0 ||
      body.ciphertext !== undefined ||
      body.poll !== undefined,
    { message: 'Message is empty', path: ['content'] },
  )
  .refine((body) => body.ciphertext === undefined || body.content.length === 0, {
    message: 'An encrypted message has no plain content',
    path: ['content'],
  })
  .transform((body) => (body.replyTo ? { ...body, replyMention: body.replyMention ?? true } : body))

export const updateMessageRequestSchema = z
  .strictObject({
    content: messageContentSchema.optional(),
    /** Encrypted conversations: the new MLS message instead of content. */
    ciphertext: base64Schema(CIPHERTEXT_MAX_BASE64).optional(),
  })
  .refine(
    (body) => (body.content === undefined) !== (body.ciphertext === undefined),
    'Either content or ciphertext',
  )

/** Cursor pagination over the message history; pages are returned oldest → newest. */
export const listMessagesQuerySchema = z
  .object({
    before: snowflakeSchema.optional(),
    after: snowflakeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(MESSAGES_PAGE_MAX).default(50),
  })
  .refine((query) => !(query.before && query.after), 'Use either before or after, not both')

/** What a reply shows of the message it answers. */
export const replySnippetSchema = z.object({
  author: publicUserSchema.nullable(),
  /** The first REPLY_SNIPPET_LENGTH characters. */
  content: z.string(),
  attachmentCount: z.number().int(),
})

export const messageReplySchema = z.object({
  messageId: snowflakeSchema,
  /** Whether the reply notifies the replied-to author. */
  mentionsAuthor: z.boolean(),
  /** null once the original was deleted. */
  message: replySnippetSchema.nullable(),
})

/**
 * Who a message really notifies, after permission checks: @everyone and @here need
 * MENTION_EVERYONE, roles must be mentionable (or the author has MENTION_EVERYONE), a reply
 * may notify its original's author. @here is kept as a flag and counts like @everyone.
 */
export const messageMentionsSchema = z.object({
  users: z.array(snowflakeSchema),
  roles: z.array(snowflakeSchema),
  everyone: z.boolean(),
  here: z.boolean(),
})

/** A preview of a link in the message, made by the server (never fetched by clients). */
export const embedSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  /** Stored on this instance: viewers never load images from the linked site. */
  image: z
    .object({ url: z.string(), width: z.number().int(), height: z.number().int() })
    .nullable(),
})

export const systemMessageKindSchema = z.enum([
  'recipient_add',
  'recipient_remove',
  'leave',
  'rename',
])
export type SystemMessageKind = z.infer<typeof systemMessageKindSchema>

export const messageSchema = z.object({
  id: snowflakeSchema,
  channelId: snowflakeSchema,
  /** null in direct messages. */
  guildId: snowflakeSchema.nullable(),
  /** null when the author's account no longer exists, or a webhook posted it. */
  author: publicUserSchema.nullable(),
  /** Posted through an incoming webhook: which one, under what name. */
  webhook: z.object({ id: snowflakeSchema, name: z.string() }).nullable(),
  /** A bot's answer to a command: who ran which one. */
  interaction: z.object({ name: z.string(), user: publicUserSchema.nullable() }).nullable(),
  /** A note the server writes in group DMs (who joined or left, a rename); the author did it. */
  system: z
    .object({
      kind: systemMessageKindSchema,
      target: publicUserSchema.nullable(),
      name: z.string().nullable(),
    })
    .nullable(),
  content: z.string(),
  /** Encrypted conversations: the MLS message (base64); `content` is empty then. */
  ciphertext: z.string().nullable(),
  createdAt: z.iso.datetime(),
  editedAt: z.iso.datetime().nullable(),
  attachments: z.array(attachmentSchema),
  /** The message this one answers, if it is a reply. */
  reply: messageReplySchema.nullable(),
  mentions: messageMentionsSchema,
  pinned: z.boolean(),
  /** Announcement channels: already sent to the channels that follow this one. */
  published: z.boolean(),
  /** Link previews; they arrive later in a MESSAGE_UPDATE. */
  embeds: z.array(embedSchema),
  /** In order of first use. `me` is per viewer; gateway copies of new messages have none. */
  reactions: z.array(reactionSchema),
  /** Encrypted conversations: each person's set of reactions, encrypted (`reactions` stays empty). */
  encryptedReactions: z.array(encryptedReactionSchema).optional(),
  /** A poll sent with the message; null or absent if none. */
  poll: pollSchema.nullable().optional(),
  nonce: z.string().nullable(),
})

/** How far a user has read in a channel. */
export const readStateSchema = z.object({
  channelId: snowflakeSchema,
  lastReadMessageId: snowflakeSchema,
})

/** Unread mentions per channel (channels without any are absent). */
export const mentionCountsSchema = z.record(snowflakeSchema, z.number().int().nonnegative())

export type ReadState = z.infer<typeof readStateSchema>
export type MessageMentions = z.infer<typeof messageMentionsSchema>
export type MentionCounts = z.infer<typeof mentionCountsSchema>
export type Embed = z.infer<typeof embedSchema>
export type CreateMessageRequest = z.input<typeof createMessageRequestSchema>
export type UpdateMessageRequest = z.infer<typeof updateMessageRequestSchema>
export type ListMessagesQuery = z.input<typeof listMessagesQuerySchema>
export type Message = z.infer<typeof messageSchema>
export type MessageReply = z.infer<typeof messageReplySchema>
export type ReplySnippet = z.infer<typeof replySnippetSchema>
