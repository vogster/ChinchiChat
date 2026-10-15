import { has, Permission, snowflakeFromTimestamp, CHINCHI_EPOCH } from '@chinchi/shared'

import { userTopic } from '../../events/event-bus'
import { HttpError, badRequest, forbidden } from '../../http/http-error'
import { isMessageChannel } from '../channels/channel.repository'
import { cannotMessage } from '../dms/dm.service'
import { previewLinks } from '../embeds/link-previews'
import { createMessageViews } from './message-views'

const sameLinks = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((link, index) => link === b[index])

import { createMessageGuards } from './message-guards'
import { createMemorySlowmode } from './slowmode'
import type { AutomodService } from '../automod/automod.service'
import type { Slowmode } from './slowmode'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { EventBus } from '../../events/event-bus'
import type { AttachmentRepository } from '../attachments/attachment.repository'
import type { AttachmentService } from '../attachments/attachment.service'
import type { ChannelEvents } from '../channels/channel-events'
import type { ChannelRepository } from '../channels/channel.repository'
import type { MentionResolver } from './mention-resolver'
import type { ReactionRepository } from './reaction.repository'
import type { LinkPreviews } from '../embeds/link-previews'
import type { ChannelService } from '../channels/channel.service'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { MessageRepository, MessageRow, PageQuery } from './message.repository'
import type { ReadStateRepository } from './read-state.repository'
import type { Channel, Message, Snowflake } from '@chinchi/shared'

const NO_AUDIT: Pick<AuditLogService, 'record'> = { record: async () => undefined }

const PURGE_BATCH = 100

export interface MessageServiceDeps {
  readonly messages: MessageRepository
  readonly readStates: ReadStateRepository
  readonly channels: ChannelService
  readonly channelRows: ChannelRepository
  readonly attachments: AttachmentService
  readonly attachmentRows: AttachmentRepository
  readonly resolveMentions: MentionResolver
  readonly reactions: ReactionRepository
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
}

/** What an edit changes: the text, or in encrypted conversations the MLS message. */
export interface MessageChange {
  readonly content?: string | undefined
  readonly ciphertext?: string | undefined
}

const NO_MENTIONS = {
  mentionUserIds: [],
  mentionRoleIds: [],
  mentionEveryone: false,
  mentionHere: false,
}

/** Encrypted conversations take only ciphertext; the others never do. */
const assertEncryption = (channel: { encrypted: boolean }, ciphertext: string | undefined) => {
  if (channel.encrypted && ciphertext === undefined) {
    throw badRequest('ENCRYPTED_CHANNEL', 'This conversation takes only encrypted messages')
  }
  if (!channel.encrypted && ciphertext !== undefined) {
    throw badRequest('NOT_ENCRYPTED', 'This conversation is not encrypted')
  }
}

const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

export const createMessageService = ({
  messages,
  readStates,
  channels,
  channelRows,
  attachments,
  attachmentRows,
  resolveMentions,
  reactions,
  users,
  linkPreviews = null,
  events,
  channelEvents,
  onAttachmentsSent = () => undefined,
  nextId,
  now = () => new Date(),
  audit = NO_AUDIT,
  slowmode = createMemorySlowmode(),
  automod,
  onThreadMessages = async () => undefined,
  onMessagesDeleted = async () => undefined,
  visibleChannels,
}: MessageServiceDeps) => {
  const views = createMessageViews({ messages, attachmentRows, reactions, users })

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
    const { users, roles, everyone, here } = await resolveMentions(input)
    return {
      mentionUserIds: users,
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
    async create(
      channelId: Snowflake,
      author: UserRow,
      {
        content,
        attachmentIds = [],
        replyTo,
        replyMention = true,
        nonce,
        ciphertext,
      }: CreateMessageInput,
    ): Promise<Message> {
      const flag =
        attachmentIds.length > 0
          ? Permission.SendMessages | Permission.AttachFiles
          : Permission.SendMessages
      const { channel, permissions } = await textChannel(channelId, author.id, flag)
      assertEncryption(channel, ciphertext)
      const original = replyTo ? await messages.findInChannel(channel.id, replyTo) : null
      if (replyTo && !original) {
        throw badRequest('INVALID_REPLY', 'Can only reply to a message in this channel')
      }
      // The server can't read an encrypted message: no mentions to find, nothing to screen.
      const mentions = ciphertext
        ? NO_MENTIONS
        : await mentionColumns({
            content,
            channelId: channel.id,
            guildId: channel.guildId,
            authorId: author.id,
            permissions,
            repliedAuthorId: replyMention ? original?.message.authorId : null,
          })
      if (!ciphertext) await screen(channel, author.id, content, permissions, true)
      const id = nextId()
      const files = await attachments.prepare(channel.id, author.id, attachmentIds, id)
      // Last before writing, so a send that fails on its files doesn't use up the turn.
      try {
        await takeSlowmodeTurn(channel, author.id, permissions)
      } catch (error) {
        await attachments.discard(files, id)
        throw error
      }
      let row
      try {
        row = await messages.insert(
          {
            id,
            channelId: channel.id,
            authorId: author.id,
            content,
            replyToId: replyTo ?? null,
            replyMention: replyTo !== undefined && replyMention,
            ...mentions,
            ...(ciphertext ? { ciphertext } : {}),
          },
          files.map((file) => file.id),
        )
      } catch (error) {
        await attachments.discard(files, id)
        throw error
      }
      await attachments.releaseUploads(files)
      if (files.some((file) => file.previewState === 'pending')) onAttachmentsSent()
      const message = await views.one(
        channel.id,
        channel.guildId,
        { message: row, author },
        { nonce },
      )
      // Previews are what EMBED_LINKS grants (webhooks and bots are set up by moderators).
      if (!ciphertext && has(permissions, Permission.EmbedLinks)) {
        linkPreviews?.schedule(channel.id, row.id, row.content)
      }
      // Your own message never shows up as unread.
      await readStates.advance(author.id, channel.id, row.id)
      await channelEvents.publish(channel, 'MESSAGE_CREATE', message)
      if (channel.type === 'thread') await onThreadMessages(channel.id, 1)
      return message
    },

    /**
     * A message posted through an incoming webhook: no author, no reply, no files. It may
     * mention people (and mentionable roles) but never @everyone, and skips slowmode and
     * automod, which the server's moderators set up the webhook to bypass.
     */
    async createFromWebhook(
      channelId: Snowflake,
      webhook: { id: Snowflake; name: string },
      content: string,
    ): Promise<Message> {
      const channel = await channelRows.findById(channelId)
      if (!channel || !isMessageChannel(channel.type)) throw unknownMessage()
      const mentions = await mentionColumns({
        content,
        channelId: channel.id,
        guildId: channel.guildId,
        authorId: webhook.id,
        permissions: 0n,
      })
      const row = await messages.insert({
        id: nextId(),
        channelId: channel.id,
        authorId: null,
        content,
        replyToId: null,
        replyMention: false,
        webhookId: webhook.id,
        webhookName: webhook.name,
        ...mentions,
      })
      const message = await views.one(channel.id, channel.guildId, { message: row, author: null })
      linkPreviews?.schedule(channel.id, row.id, row.content)
      await channelEvents.publish(channel, 'MESSAGE_CREATE', message)
      if (channel.type === 'thread') await onThreadMessages(channel.id, 1)
      return message
    },

    /** A bot's answer to a slash command: posted as the bot, noting who ran the command. */
    async createAsInteraction(
      channelId: Snowflake,
      input: {
        botId: Snowflake
        commandName: string
        userId: Snowflake | null
        content: string
        /** The bot's permissions in the channel (automod skips moderators). */
        permissions: bigint
      },
    ): Promise<Message> {
      const channel = await channelRows.findById(channelId)
      if (!channel || !isMessageChannel(channel.type)) throw unknownMessage()
      // Bots often echo what they were given: automod must not be bypassed through them.
      await screen(channel, input.botId, input.content, input.permissions, true)
      const mentions = await mentionColumns({
        content: input.content,
        channelId: channel.id,
        guildId: channel.guildId,
        authorId: input.botId,
        permissions: 0n,
      })
      const row = await messages.insert({
        id: nextId(),
        channelId: channel.id,
        authorId: input.botId,
        content: input.content,
        replyToId: null,
        replyMention: false,
        interactionName: input.commandName,
        interactionUserId: input.userId,
        ...mentions,
      })
      const found = await messages.findInChannel(channel.id, row.id)
      const message = await views.one(
        channel.id,
        channel.guildId,
        found ?? { message: row, author: null },
      )
      linkPreviews?.schedule(channel.id, row.id, row.content)
      await channelEvents.publish(channel, 'MESSAGE_CREATE', message)
      if (channel.type === 'thread') await onThreadMessages(channel.id, 1)
      return message
    },

    /**
     * A note in a group DM about what someone did there (added or removed a person, left,
     * renamed it). It has no text and can't be edited.
     */
    async createSystem(
      channelId: Snowflake,
      actorId: Snowflake,
      system: NonNullable<MessageRow['system']>,
    ): Promise<void> {
      const channel = await channelRows.findById(channelId)
      if (!channel) return
      const row = await messages.insert({
        id: nextId(),
        channelId: channel.id,
        authorId: actorId,
        content: '',
        replyToId: null,
        replyMention: false,
        system,
        mentionUserIds: [],
        mentionRoleIds: [],
        mentionEveryone: false,
        mentionHere: false,
      })
      const found = await messages.findInChannel(channel.id, row.id)
      const message = await views.one(
        channel.id,
        channel.guildId,
        found ?? { message: row, author: null },
      )
      // Neither who did it nor whom it is about learns anything new from it.
      await readStates.advance(actorId, channel.id, row.id)
      if (system.targetId) await readStates.advance(system.targetId, channel.id, row.id)
      await channelEvents.publish(channel, 'MESSAGE_CREATE', message)
    },

    /** A command run counts as a message for slowmode: each one makes the bot post. */
    takeSlowmodeTurn,

    async list(channelId: Snowflake, userId: Snowflake, query: PageQuery): Promise<Message[]> {
      const { channel } = await textChannel(channelId, userId, Permission.ReadMessageHistory)
      const page = await messages.page(channel.id, query)
      return views.build(channel.id, channel.guildId, page, { viewerId: userId })
    },

    /** Only the author may edit: an edit puts words in someone's mouth. */
    async update(
      channelId: Snowflake,
      messageId: Snowflake,
      userId: Snowflake,
      { content, ciphertext }: MessageChange,
    ): Promise<Message> {
      const { access, channel, permissions } = await textChannel(channelId, userId)
      assertEncryption(channel, ciphertext)
      // An edit is a new message to the reader: a block or a privacy change stops it too.
      if (channel.type === 'dm' && !has(permissions, Permission.SendMessages)) {
        throw cannotMessage()
      }
      // ...and a timeout or a mute: otherwise old messages could be rewritten instead.
      if (access?.context.timedOut || (access && !has(permissions, Permission.SendMessages))) {
        throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
      }
      const found = await findIn(channel.id, messageId)
      if (found.message.authorId !== userId || found.message.system) {
        throw forbidden('NOT_MESSAGE_AUTHOR', 'Only the author can edit a message')
      }
      if (ciphertext !== undefined) {
        const row = await messages.updateCiphertext(messageId, ciphertext, now())
        const message = await views.one(
          channel.id,
          channel.guildId,
          { message: row, author: found.author },
          { viewerId: userId },
        )
        await channelEvents.publish(channel, 'MESSAGE_UPDATE', message)
        return message
      }
      if (content === undefined) throw badRequest('INVALID_BODY', 'Nothing to change')
      const mentions = await mentionColumns({
        content,
        channelId: channel.id,
        guildId: channel.guildId,
        authorId: userId,
        permissions,
        repliedAuthorId: await repliedAuthor(
          channel.id,
          found.message.replyToId,
          found.message.replyMention,
        ),
      })
      await screen(channel, userId, content, permissions, false)
      let row = await messages.updateContent(messageId, content, now(), mentions)
      // Other links: the old previews go now, new ones follow in the background.
      if (!sameLinks(previewLinks(found.message.content), previewLinks(content))) {
        row = (await messages.setEmbeds(messageId, [])) ?? row
        if (has(permissions, Permission.EmbedLinks)) {
          linkPreviews?.schedule(channel.id, messageId, content)
        }
      }
      // The editor gets their own `me` on reactions; the broadcast below is the same copy, and
      // clients keep the reactions they already know on MESSAGE_UPDATE.
      const message = await views.one(
        channel.id,
        channel.guildId,
        { message: row, author: found.author },
        { viewerId: userId },
      )
      await channelEvents.publish(channel, 'MESSAGE_UPDATE', message)
      return message
    },

    /** The author, or anyone with MANAGE_MESSAGES in the channel. */
    async delete(channelId: Snowflake, messageId: Snowflake, userId: Snowflake): Promise<void> {
      const { channel, permissions } = await textChannel(channelId, userId)
      const found = await findIn(channel.id, messageId)
      if (found.message.authorId !== userId && !has(permissions, Permission.ManageMessages)) {
        throw forbidden('MISSING_PERMISSIONS', "You can't delete this message")
      }
      const files = await attachmentRows.listByMessages([messageId])
      // Two deletes at once: only the one that removed the row goes on.
      if (!(await messages.delete(messageId))) throw unknownMessage()
      await onMessagesDeleted([messageId])
      await attachments.removeFiles(files, messageId)
      await channelEvents.publish(channel, 'MESSAGE_DELETE', {
        id: messageId,
        channelId: channel.id,
        guildId: channel.guildId,
      })
      if (channel.type === 'thread') await onThreadMessages(channel.id, -1)
      if (channel.guildId && found.message.authorId !== userId) {
        await audit.record({
          guildId: channel.guildId,
          action: 'message_delete',
          actorId: userId,
          targetUserId: found.message.authorId,
          targetId: messageId,
          data: { channelId: channel.id },
        })
      }
    },

    /**
     * Deletes an author's messages on a server from the last `seconds` (a ban's cleanup), with
     * their files, telling clients about each.
     */
    async purgeAuthor(guildId: Snowflake, authorId: Snowflake, seconds: number): Promise<number> {
      if (seconds <= 0) return 0
      const since = snowflakeFromTimestamp(Math.max(Date.now() - seconds * 1000, CHINCHI_EPOCH))
      const found = await messages.listRecentByAuthorInGuild(guildId, authorId, since)
      const perChannel = new Map<Snowflake, number>()
      let total = 0
      // A raid can leave thousands of messages: delete them a page at a time.
      for (let start = 0; start < found.length; start += PURGE_BATCH) {
        const candidates = found.slice(start, start + PURGE_BATCH)
        const files = await attachmentRows.listByMessages(candidates.map((m) => m.id))
        // Only what this call really deleted (another delete may have been faster).
        const deleted = new Set(await messages.deleteMany(candidates.map((m) => m.id)))
        const batch = candidates.filter((m) => deleted.has(m.id))
        total += batch.length
        await onMessagesDeleted(batch.map((m) => m.id))
        for (const { id, channelId } of batch) {
          perChannel.set(channelId, (perChannel.get(channelId) ?? 0) + 1)
          await attachments.removeFiles(
            files.filter((file) => file.messageId === id),
            id,
          )
          await channelEvents.publish({ id: channelId, guildId }, 'MESSAGE_DELETE', {
            id,
            channelId,
            guildId,
          })
        }
      }
      // Threads among them lose those messages from their counts (no-op for other channels).
      for (const [channelId, removed] of perChannel) await onThreadMessages(channelId, -removed)
      return total
    },

    /** Re-sends a message to clients after its attachments changed (e.g. a preview is ready). */
    async republish(channelId: Snowflake, messageId: Snowflake): Promise<void> {
      const [channel, found] = await Promise.all([
        channelRows.findById(channelId),
        messages.findInChannel(channelId, messageId),
      ])
      if (!channel || !found) return
      await channelEvents.publish(
        channel,
        'MESSAGE_UPDATE',
        await views.one(channelId, channel.guildId, found),
      )
    },

    /** Marks the channel read up to `messageId` and syncs the user's other devices. */
    async ack(channelId: Snowflake, messageId: Snowflake, userId: Snowflake): Promise<void> {
      const { channel, access } = await textChannel(channelId, userId)
      await findIn(channel.id, messageId)
      const lastReadMessageId = await readStates.advance(userId, channel.id, messageId)
      // In DMs every unread message counts, like a mention.
      const counts = access
        ? await readStates.mentionCounts(userId, [channel.id], access.memberRoleIds)
        : await readStates.unreadCounts(userId, [channel.id])
      await events.publish({
        topic: userTopic(userId),
        type: 'CHANNEL_ACK',
        data: { channelId: channel.id, lastReadMessageId, mentionCount: counts[channel.id] ?? 0 },
      })
    },

    /** Marks every channel of a server the user can see read up to its newest message. */
    async ackGuild(guildId: Snowflake, userId: Snowflake): Promise<void> {
      if (!visibleChannels) return
      const unread = (await visibleChannels(guildId, userId)).filter(
        (channel) =>
          (channel.type === 'text' || channel.type === 'thread') && channel.lastMessageId !== null,
      )
      for (const channel of unread) {
        const lastReadMessageId = await readStates.advance(
          userId,
          channel.id,
          channel.lastMessageId as Snowflake,
        )
        await events.publish({
          topic: userTopic(userId),
          type: 'CHANNEL_ACK',
          data: { channelId: channel.id, lastReadMessageId, mentionCount: 0 },
        })
      }
    },

    listReadStates: (userId: Snowflake) => readStates.listForUser(userId),

    async typing(channelId: Snowflake, userId: Snowflake): Promise<void> {
      const { channel } = await textChannel(channelId, userId, Permission.SendMessages)
      await channelEvents.publish(channel, 'TYPING_START', {
        channelId: channel.id,
        guildId: channel.guildId,
        userId,
        timestamp: now().toISOString(),
      })
    },
  }
}

export type MessageService = ReturnType<typeof createMessageService>
