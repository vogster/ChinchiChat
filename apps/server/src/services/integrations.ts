import { createAnnouncementService } from '../modules/announcements/announcement.service'
import { createBotService } from '../modules/bots/bot.service'
import { createCommandService } from '../modules/commands/command.service'
import { createEmojiService } from '../modules/emojis/emoji.service'
import { createWebhookService } from '../modules/webhooks/webhook.service'

import type { Database } from '../db/client'
import type { EventBus } from '../events/event-bus'
import type { ChannelService } from '../modules/channels/channel.service'
import type { ChannelEvents } from '../modules/channels/channel-events'
import type { EmojiRepository } from '../modules/emojis/emoji.service'
import type { GuildRepository } from '../modules/guilds/guild.repository'
import type { GuildAccessChecks } from '../modules/guilds/guild-access'
import type { GuildViews } from '../modules/guilds/guild-views'
import type { MessageRepository } from '../modules/messages/message.repository'
import type { MessageService } from '../modules/messages/message.service'
import type { MessageViews } from '../modules/messages/message-views'
import type { AuditLogService } from '../modules/moderation/audit-log.service'
import type { ObjectStorage } from '../storage/object-storage'
import type { Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

export interface IntegrationServiceDeps {
  readonly db: Database
  readonly events: EventBus
  readonly nextId: () => Snowflake
  readonly log: FastifyBaseLogger
  readonly publicUrl: string
  readonly storage: ObjectStorage | undefined
  readonly audit: AuditLogService
  readonly access: GuildAccessChecks
  readonly guilds: GuildRepository
  readonly views: GuildViews
  readonly channels: ChannelService
  readonly channelEvents: ChannelEvents
  readonly messageRows: MessageRepository
  readonly messageViews: MessageViews
  readonly messages: MessageService
  readonly emojis: EmojiRepository
}

/** What extends a server: custom emoji, incoming webhooks, bots and their commands, announcements. */
export const createIntegrationServices = ({
  db,
  events,
  nextId,
  log,
  publicUrl,
  storage,
  audit,
  access,
  guilds,
  views,
  channels,
  channelEvents,
  messageRows,
  messageViews,
  messages,
  emojis,
}: IntegrationServiceDeps) => {
  const webhook = createWebhookService({ db, publicUrl, audit, channels, messages, nextId })
  return {
    emoji: createEmojiService({ db, emojis, access, storage, events, nextId, log }),
    webhook,
    bot: createBotService({ db, guilds, access, views, events, nextId }),
    command: createCommandService({ db, access, channels, messages, events, nextId }),
    announcement: createAnnouncementService({
      db,
      channels,
      messageRows,
      messages,
      webhooks: webhook,
      views: messageViews,
      channelEvents,
      log,
    }),
  }
}
