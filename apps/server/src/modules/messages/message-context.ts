import { has } from '@chinchi/shared'

import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { isMessageChannel } from '../channels/channel.repository'
import { cannotMessage } from '../dms/dm.service'
import { createForwarding } from './forwarding'
import { createMessageGuards } from './message-guards'
import { createMessageViews } from './message-views'
import { createMemorySlowmode } from './slowmode'

import type { EventBus } from '../../events/event-bus'
import type { AttachmentRepository } from '../attachments/attachment.repository'
import type { AttachmentService } from '../attachments/attachment.service'
import type { AutomodService } from '../automod/automod.service'
import type { ChannelRepository } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { ChannelEvents } from '../channels/channel-events'
import type { LinkPreviews } from '../embeds/link-previews'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { UserRepository } from '../users/user.repository'
import type { MentionResolver } from './mention-resolver'
import type { MessageRepository } from './message.repository'
import type { PollRepository } from './poll.repository'
import type { ReactionRepository } from './reaction.repository'
import type { ReadStateRepository } from './read-state.repository'
import type { Slowmode } from './slowmode'
import type { Channel, createPollSchema, Snowflake } from '@chinchi/shared'
import type { z } from 'zod'

export interface MessageServiceDeps {
  readonly messages: MessageRepository
  readonly readStates: ReadStateRepository
  readonly channels: ChannelService
  readonly channelRows: ChannelRepository
  readonly attachments: AttachmentService
  readonly attachmentRows: AttachmentRepository
  readonly resolveMentions: MentionResolver
  readonly reactions: ReactionRepository
  readonly polls?: Pick<PollRepository, 'summaries'> | undefined
  /** People who ran the commands bot messages answer. */
  readonly users: Pick<UserRepository, 'findByIds'>
  /** Link previews for new and edited messages; absent when the instance has them off. */
  readonly linkPreviews?: LinkPreviews | null
  readonly events: EventBus
  /** Publishes channel events to the server or, for DMs, to each member. */
  readonly channelEvents: ChannelEvents
  /** Sent messages with files: lets the preview worker start right away. */
  readonly onAttachmentsSent?: () => void
  readonly nextId: () => Snowflake
  readonly now?: () => Date
  /** Writes moderation and settings changes to the server's audit log. */
  readonly audit?: Pick<AuditLogService, 'record'>
  /** Slowmode turns; in memory by default (one process). */
  readonly slowmode?: Slowmode
  /** Automatic moderation of server messages; off by default. */
  readonly automod?: Pick<AutomodService, 'check'>
  /** A thread's message count changed (threads show how many replies they hold). */
  readonly onThreadMessages?: (threadId: Snowflake, delta: number) => Promise<void>
  /** Messages went away (threads started from them lose their anchor). */
  readonly onMessagesDeleted?: (messageIds: readonly Snowflake[]) => Promise<void>
  /** The server's channels the user can see (404 for non-members); for marking it read. */
  readonly visibleChannels?: (guildId: Snowflake, userId: Snowflake) => Promise<readonly Channel[]>
}

export interface CreateMessageInput {
  readonly content: string
  readonly attachmentIds?: readonly Snowflake[] | undefined
  readonly replyTo?: Snowflake | undefined
  readonly replyMention?: boolean | undefined
  readonly nonce?: string | undefined
  /** Encrypted conversations: the MLS message (base64); content stays empty. */
  readonly ciphertext?: string | undefined
  readonly poll?: z.output<typeof createPollSchema> | undefined
  readonly forward?: { readonly channelId: Snowflake; readonly messageId: Snowflake } | undefined
}

/** What an edit changes: the text, or in encrypted conversations the MLS message. */
export interface MessageChange {
  readonly content?: string | undefined
  readonly ciphertext?: string | undefined
}

const NO_AUDIT: Pick<AuditLogService, 'record'> = { record: async () => undefined }

/** The dependencies with every optional one filled in. */
export type ResolvedMessageDeps = Omit<
  MessageServiceDeps,
  | 'linkPreviews'
  | 'onAttachmentsSent'
  | 'now'
  | 'audit'
  | 'slowmode'
  | 'onThreadMessages'
  | 'onMessagesDeleted'
> & {
  readonly linkPreviews: LinkPreviews | null
  readonly onAttachmentsSent: () => void
  readonly now: () => Date
  readonly audit: Pick<AuditLogService, 'record'>
  readonly slowmode: Slowmode
  readonly onThreadMessages: (threadId: Snowflake, delta: number) => Promise<void>
  readonly onMessagesDeleted: (messageIds: readonly Snowflake[]) => Promise<void>
}

export const resolveMessageDeps = (deps: MessageServiceDeps): ResolvedMessageDeps => ({
  ...deps,
  linkPreviews: deps.linkPreviews ?? null,
  onAttachmentsSent: deps.onAttachmentsSent ?? (() => undefined),
  now: deps.now ?? (() => new Date()),
  audit: deps.audit ?? NO_AUDIT,
  slowmode: deps.slowmode ?? createMemorySlowmode(),
  onThreadMessages: deps.onThreadMessages ?? (async () => undefined),
  onMessagesDeleted: deps.onMessagesDeleted ?? (async () => undefined),
})

export const NO_MENTIONS = {
  mentionUserIds: [],
  mentionRoleIds: [],
  mentionEveryone: false,
  mentionHere: false,
}

/** Encrypted conversations take only ciphertext; the others never do. */
export const assertEncryption = (
  channel: { encrypted: boolean },
  ciphertext: string | undefined,
) => {
  if (channel.encrypted && ciphertext === undefined) {
    throw badRequest('ENCRYPTED_CHANNEL', 'This conversation takes only encrypted messages')
  }
  if (!channel.encrypted && ciphertext !== undefined) {
    throw badRequest('NOT_ENCRYPTED', 'This conversation is not encrypted')
  }
}

export const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

export const sameLinks = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((link, index) => link === b[index])

/** What every part of the message service shares: views, access checks, guards, lookups. */
export const createMessageContext = ({
  messages,
  channels,
  attachmentRows,
  reactions,
  polls,
  users,
  resolveMentions,
  slowmode,
  automod,
}: ResolvedMessageDeps) => {
  const views = createMessageViews({ messages, attachmentRows, reactions, polls, users })
  const forwarding = createForwarding({ channels, messages, attachmentRows })

  /**
   * A text channel or DM the user can see (404 otherwise) with the given permission in it
   * (403). In a 1:1 DM a missing send right means a block: that gets its own code.
   */
  const textChannel = async (channelId: Snowflake, userId: Snowflake, flag?: bigint) => {
    const resolved = await channels.resolve(channelId, userId)
    if (!isMessageChannel(resolved.channel.type)) {
      throw badRequest('INVALID_CHANNEL', 'Messages can only be sent to text channels')
    }
    if (flag !== undefined && !has(resolved.permissions, flag)) {
      if (resolved.channel.type === 'dm') throw cannotMessage()
      if (resolved.access?.context.pending) {
        throw forbidden('RULES_NOT_ACCEPTED', 'Accept the server rules first')
      }
      throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
    }
    return resolved
  }

  const { screen, takeSlowmodeTurn } = createMessageGuards({ slowmode, automod })

  /** Mentions as stored columns. */
  const mentionColumns = async (input: Parameters<MentionResolver>[0]) => {
    const { users: userIds, roles, everyone, here } = await resolveMentions(input)
    return {
      mentionUserIds: userIds,
      mentionRoleIds: roles,
      mentionEveryone: everyone,
      mentionHere: here,
    }
  }

  /** The author a reply notifies, if it does and the original is still there. */
  const repliedAuthor = async (
    channelId: Snowflake,
    replyToId: Snowflake | null,
    notify: boolean,
  ) => {
    if (!replyToId || !notify) return null
    return (await messages.findInChannel(channelId, replyToId))?.message.authorId ?? null
  }

  const findIn = async (channelId: Snowflake, messageId: Snowflake) => {
    const found = await messages.findInChannel(channelId, messageId)
    if (!found) throw unknownMessage()
    return found
  }

  return {
    views,
    forwarding,
    textChannel,
    screen,
    takeSlowmodeTurn,
    mentionColumns,
    repliedAuthor,
    findIn,
  }
}

export type MessageContext = ReturnType<typeof createMessageContext>
