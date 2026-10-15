import { Permission, has } from '@chinchi/shared'
import { and, eq, isNull } from 'drizzle-orm'

import { messages as messagesTable, webhooks } from '../../db/schema'
import { HttpError, badRequest, conflict, forbidden } from '../../http/http-error'

import type { Database } from '../../db/client'
import type { ChannelEvents } from '../channels/channel-events'
import type { ChannelRow } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { MessageViews } from '../messages/message-views'
import type { MessageRepository } from '../messages/message.repository'
import type { MessageService } from '../messages/message.service'
import type { WebhookService } from '../webhooks/webhook.service'
import type { Message, Snowflake, Webhook } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

export interface AnnouncementServiceDeps {
  readonly db: Database
  readonly channels: Pick<ChannelService, 'resolveGuild'>
  readonly messageRows: Pick<MessageRepository, 'findInChannel'>
  readonly messages: Pick<MessageService, 'createFromWebhook'>
  readonly webhooks: Pick<WebhookService, 'create'>
  readonly views: MessageViews
  readonly channelEvents: ChannelEvents
  readonly log?: Pick<FastifyBaseLogger, 'warn'>
  readonly now?: () => Date
}

const WEBHOOK_NAME_MAX = 80
const FAN_OUT_BATCH = 5

const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

const assertAnnouncement = (channel: ChannelRow) => {
  if (channel.type !== 'text' || !channel.announcement) {
    throw badRequest('NOT_ANNOUNCEMENT', 'This is not an announcement channel')
  }
}

/** How copies are signed in the following channels: "<server> #<channel>". */
const copyName = (guildName: string, channelName: string) =>
  `${guildName} #${channelName}`.slice(0, WEBHOOK_NAME_MAX)

/**
 * Announcement channels: other channels follow them through a webhook, and a published
 * message is copied into every follower.
 */
export const createAnnouncementService = ({
  db,
  channels,
  messageRows,
  messages,
  webhooks: webhookService,
  views,
  channelEvents,
  log,
  now = () => new Date(),
}: AnnouncementServiceDeps) => {
  /** Access check that answers null instead of throwing a client error. */
  const allowed = async (channelId: Snowflake, userId: Snowflake, flag: bigint) => {
    try {
      return (await channels.resolveGuild(channelId, userId, flag)).channel
    } catch (error) {
      if (error instanceof HttpError && error.statusCode < 500) return null
      throw error
    }
  }

  /**
   * A follow holds while its creator still sees the source and manages the target, and an
   * age-restricted source still goes only into an age-restricted channel.
   */
  const followHolds = async (
    source: ChannelRow,
    hook: { channelId: Snowflake; createdBy: Snowflake | null },
  ) => {
    if (!hook.createdBy) return false
    const sees = await allowed(source.id, hook.createdBy, Permission.ReadMessageHistory)
    const target =
      sees && (await allowed(hook.channelId, hook.createdBy, Permission.ManageChannels))
    return Boolean(target && (!source.nsfw || target.nsfw))
  }

  /** Copies go out a few at a time, so a popular channel doesn't drain the pool at once. */
  const fanOut = async <T>(items: readonly T[], send: (item: T) => Promise<unknown>) => {
    let failed = 0
    for (let start = 0; start < items.length; start += FAN_OUT_BATCH) {
      const results = await Promise.allSettled(items.slice(start, start + FAN_OUT_BATCH).map(send))
      failed += results.filter((result) => result.status === 'rejected').length
    }
    return failed
  }

  return {
    /** Needs to see the announcement channel and to manage the channel that follows it. */
    async follow(
      sourceId: Snowflake,
      userId: Snowflake,
      targetChannelId: Snowflake,
    ): Promise<Webhook> {
      const { channel: source, access } = await channels.resolveGuild(sourceId, userId)
      assertAnnouncement(source)
      if (targetChannelId === source.id) {
        throw badRequest('INVALID_CHANNEL', "A channel can't follow itself")
      }
      const { channel: target } = await channels.resolveGuild(
        targetChannelId,
        userId,
        Permission.ManageChannels,
      )
      if (source.nsfw && !target.nsfw) {
        throw badRequest(
          'NSFW_MISMATCH',
          'Age-restricted channels are followed by such channels only',
        )
      }
      const { webhook } = await webhookService.create(
        targetChannelId,
        userId,
        copyName(access.guild.name, source.name),
        source.id,
      )
      return webhook
    },

    /** The author (or a moderator) sends a message out once to every following channel. */
    async publish(channelId: Snowflake, messageId: Snowflake, userId: Snowflake): Promise<Message> {
      const { channel, permissions, access } = await channels.resolveGuild(
        channelId,
        userId,
        Permission.ReadMessageHistory,
      )
      assertAnnouncement(channel)
      const found = await messageRows.findInChannel(channel.id, messageId)
      if (!found) throw unknownMessage()
      const own = found.message.authorId === userId
      if (!has(permissions, own ? Permission.SendMessages : Permission.ManageMessages)) {
        throw forbidden('MISSING_PERMISSIONS', "You can't publish this message")
      }
      if (!found.message.content.trim()) {
        throw badRequest('NOTHING_TO_PUBLISH', 'Only text is published')
      }
      // Claimed atomically: two publishes at once can't both send copies.
      const [row] = await db
        .update(messagesTable)
        .set({ publishedAt: now() })
        .where(and(eq(messagesTable.id, messageId), isNull(messagesTable.publishedAt)))
        .returning()
      if (!row) throw conflict('ALREADY_PUBLISHED', 'This message was already published')

      const followers = await db
        .select({ id: webhooks.id, channelId: webhooks.channelId, createdBy: webhooks.createdBy })
        .from(webhooks)
        .where(eq(webhooks.sourceChannelId, channel.id))
      const name = copyName(access.guild.name, channel.name)
      // Follows whose creator lost access (kicked, role removed, channel hidden) end here.
      const holding: typeof followers = []
      for (const hook of followers) {
        if (await followHolds(channel, hook)) holding.push(hook)
        else await db.delete(webhooks).where(eq(webhooks.id, hook.id))
      }
      // One follower failing (its channel just went away) doesn't stop the rest.
      const failed = await fanOut(holding, (hook) =>
        messages.createFromWebhook(hook.channelId, { id: hook.id, name }, row.content),
      )
      if (failed > 0) log?.warn({ channelId: channel.id, failed }, 'announcement copies failed')

      const message = await views.one(channel.id, channel.guildId, {
        message: row,
        author: found.author,
      })
      await channelEvents.publish(channel, 'MESSAGE_UPDATE', message)
      return message
    },
  }
}

export type AnnouncementService = ReturnType<typeof createAnnouncementService>
