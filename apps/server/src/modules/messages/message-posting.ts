import { isMessageChannel } from '../channels/channel.repository'
import { unknownMessage } from './message-context'

import type { MessageContext, ResolvedMessageDeps } from './message-context'
import type { MessageRow } from './message.repository'
import type { Message, Snowflake } from '@chinchi/shared'

/** Messages nobody typed into a channel: webhooks, bot answers and group-DM notes. */
export const createMessagePosting = (
  {
    channelRows,
    messages,
    readStates,
    linkPreviews,
    channelEvents,
    nextId,
    onThreadMessages,
  }: ResolvedMessageDeps,
  { views, mentionColumns, screen }: MessageContext,
) => ({
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
})
