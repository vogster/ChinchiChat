import { CHINCHI_EPOCH, has, Permission, snowflakeFromTimestamp } from '@chinchi/shared'

import { badRequest, forbidden } from '../../http/http-error'
import { cannotMessage } from '../dms/dm.service'
import { previewLinks } from '../embeds/link-previews'
import { encryptedForward } from './forwarding'
import {
  assertEncryption,
  createMessageContext,
  NO_MENTIONS,
  resolveMessageDeps,
  sameLinks,
  unknownMessage,
} from './message-context'
import { createMessagePosting } from './message-posting'
import { createMessageReading } from './message-reading'

import type { UserRow } from '../users/user.repository'
import type { PageQuery } from './message.repository'
import type { CreateMessageInput, MessageChange, MessageServiceDeps } from './message-context'
import type { Message, Snowflake } from '@chinchi/shared'

export type { CreateMessageInput, MessageChange, MessageServiceDeps } from './message-context'

const PURGE_BATCH = 100

export const createMessageService = (input: MessageServiceDeps) => {
  const deps = resolveMessageDeps(input)
  const {
    messages,
    readStates,
    attachments,
    attachmentRows,
    linkPreviews,
    channelRows,
    channelEvents,
    onAttachmentsSent,
    nextId,
    now,
    audit,
    onThreadMessages,
    onMessagesDeleted,
  } = deps
  const context = createMessageContext(deps)
  const {
    views,
    forwarding,
    textChannel,
    screen,
    takeSlowmodeTurn,
    mentionColumns,
    repliedAuthor,
    findIn,
  } = context

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
        poll,
        forward,
      }: CreateMessageInput,
    ): Promise<Message> {
      // The original first: forwarding needs it readable, and its files need ATTACH_FILES.
      const source = forward
        ? await forwarding.source(forward.channelId, forward.messageId, author.id)
        : null
      const flag =
        attachmentIds.length > 0 || (source?.files.length ?? 0) > 0
          ? Permission.SendMessages | Permission.AttachFiles
          : Permission.SendMessages
      const { channel, permissions } = await textChannel(channelId, author.id, flag)
      assertEncryption(channel, ciphertext)
      // Votes are counted by the server, which can't read an encrypted conversation.
      if (poll && channel.encrypted) {
        throw badRequest('ENCRYPTED_CHANNEL', 'Encrypted conversations have no polls')
      }
      if (source && channel.encrypted) throw encryptedForward()
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
      const forwardedFiles = source
        ? await attachments.cloneAsUploads(source.messageId, source.files, channel.id, author.id)
        : []
      const files = await attachments.prepare(
        channel.id,
        author.id,
        [...attachmentIds, ...forwardedFiles],
        id,
      )
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
            ...(source ? { forward: source.column } : {}),
          },
          files.map((file) => file.id),
          poll && {
            question: poll.question,
            answers: poll.answers,
            multiple: poll.multiple,
            anonymous: poll.anonymous,
            expiresAt: new Date(now().getTime() + poll.durationHours * 3_600_000),
          },
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

    ...createMessagePosting(deps, context),

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

    ...createMessageReading(deps, context),
  }
}

export type MessageService = ReturnType<typeof createMessageService>
