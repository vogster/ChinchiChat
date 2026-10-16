import { customEmojiText } from '@chinchi/shared'
import { createSnowflakeGenerator } from '@chinchi/shared'

import { createLogMailer } from './mail/mailer'
import { createAttachmentRepository } from './modules/attachments/attachment.repository'
import { createAttachmentService } from './modules/attachments/attachment.service'
import { createPreviewWorker } from './modules/attachments/preview-worker'
import { createMediaService } from './modules/media/media.service'
import { createRelationshipRepository } from './modules/relationships/relationship.repository'
import { createRelationshipService } from './modules/relationships/relationship.service'
import { createAccountEmailService } from './modules/auth/account-email.service'
import { createAdminRepository } from './modules/admin/admin.repository'
import { createAdminService } from './modules/admin/admin.service'
import {
  createInstanceInviteRepository,
  createInstanceSettings,
} from './modules/admin/instance-settings'
import { createAuthService } from './modules/auth/auth.service'
import { createBotService } from './modules/bots/bot.service'
import { createAccountDeletion } from './modules/users/account-deletion.service'
import { createCommandService } from './modules/commands/command.service'
import { createAnnouncementService } from './modules/announcements/announcement.service'
import { createWebhookService } from './modules/webhooks/webhook.service'
import { createEmojiRepository, createEmojiService, emojiKey } from './modules/emojis/emoji.service'
import { createThreadService } from './modules/channels/thread.service'
import { createSearchService } from './modules/messages/search.service'
import {
  createAutomodService,
  createMemoryAutomodCounters,
  createRedisAutomodCounters,
} from './modules/automod/automod.service'
import { createReportRepository } from './modules/reports/report.repository'
import { createReportService } from './modules/reports/report.service'
import { createMemoryMfaTickets, createRedisMfaTickets } from './modules/auth/mfa-tickets'
import { createMfaRepository } from './modules/auth/mfa.repository'
import { createMfaService } from './modules/auth/mfa.service'
import { createMemoryLoginThrottle, createRedisLoginThrottle } from './modules/auth/login-throttle'
import { createEmailTokenRepository } from './modules/auth/email-token.repository'
import { createSessionRepository } from './modules/auth/session.repository'
import { createChannelEvents } from './modules/channels/channel-events'
import { createChannelRepository } from './modules/channels/channel.repository'
import { createDmRepository } from './modules/dms/dm.repository'
import { createDmService } from './modules/dms/dm.service'
import { createGroupDmService } from './modules/dms/group-dm.service'
import { createChannelService } from './modules/channels/channel.service'
import { createGuildAccess } from './modules/guilds/guild-access'
import { createGuildViews } from './modules/guilds/guild-views'
import { createGuildRepository } from './modules/guilds/guild.repository'
import { createGuildService } from './modules/guilds/guild.service'
import { createInviteRepository } from './modules/invites/invite.repository'
import { createInviteService } from './modules/invites/invite.service'
import { createMessageRepository } from './modules/messages/message.repository'
import { createMentionCounter } from './modules/messages/mention-counter'
import { createMentionResolver } from './modules/messages/mention-resolver'
import { createRedisSlowmode } from './modules/messages/slowmode'
import { createMessageService } from './modules/messages/message.service'
import { createNotificationRepository } from './modules/notifications/notification.repository'
import { createNotificationService } from './modules/notifications/notification.service'
import { createE2eeRepository } from './modules/e2ee/e2ee.repository'
import { createBackupRepository } from './modules/e2ee/backup.repository'
import { createBackupService } from './modules/e2ee/backup.service'
import { createE2eeService } from './modules/e2ee/e2ee.service'
import { createReactionRepository } from './modules/messages/reaction.repository'
import { createReactionService } from './modules/messages/reaction.service'
import { createMessageViews } from './modules/messages/message-views'
import { createPinService } from './modules/messages/pin.service'
import { createLinkPreviews } from './modules/embeds/link-previews'
import { createLinkUnfurler } from './modules/embeds/link-unfurler'
import { createSafeFetcher } from './net/safe-fetch'
import { createReadStateRepository } from './modules/messages/read-state.repository'
import { createOverwriteRepository } from './modules/roles/overwrite.repository'
import { createRoleRepository } from './modules/roles/role.repository'
import { createRoleService } from './modules/roles/role.service'
import { createProfileEvents } from './modules/users/profile-events'
import { createProfileService } from './modules/users/profile.service'
import { createAuditLogRepository } from './modules/moderation/audit-log.repository'
import { createAuditLogService } from './modules/moderation/audit-log.service'
import { createBanRepository } from './modules/moderation/ban.repository'
import { createModerationService } from './modules/moderation/moderation.service'
import { createMemberNicknameService } from './modules/guilds/member-nickname.service'
import { createUserRepository } from './modules/users/user.repository'
import { createLiveKitRooms } from './modules/voice/livekit'
import { createVoiceStateStore } from './modules/voice/voice-state.store'
import { createVoiceService } from './modules/voice/voice.service'

import type { Config } from './config/env'
import type { Database } from './db/client'
import type { EventBus } from './events/event-bus'
import type { PreviewWorker } from './modules/attachments/preview-worker'
import type { PresenceLookup } from './modules/invites/invite.service'
import type { Mailer } from './mail/mailer'
import type { ObjectStorage } from './storage/object-storage'
import type { SafeFetchOptions } from './net/safe-fetch'
import type { VoiceRooms } from './modules/voice/livekit'
import type { Redis } from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'

export interface ServiceDeps {
  readonly db: Database
  readonly events: EventBus
  readonly presence?: PresenceLookup
  readonly mailer: Mailer | undefined
  readonly storage?: ObjectStorage | undefined
  readonly redis?: Redis | undefined
  /** Tests only: lets link previews reach a local test site. */
  readonly linkFetchOverrides?: Pick<SafeFetchOptions, 'isAllowedAddress' | 'isAllowedPort'>
  /** Tests only: replaces LiveKit's room API. */
  readonly voiceRooms?: VoiceRooms
  readonly log: FastifyBaseLogger
}

/** Wires repositories and services; HTTP and gateway layers only see the result. */
export const createServices = (
  config: Config,
  {
    db,
    events,
    mailer,
    storage,
    redis,
    linkFetchOverrides,
    log,
    presence,
    voiceRooms,
  }: ServiceDeps,
) => {
  const nextId = createSnowflakeGenerator({ workerId: config.workerId })
  const users = createUserRepository(db)
  const sessions = createSessionRepository(db)
  const instanceSettings = createInstanceSettings(db, {
    registrationMode: config.registrationMode,
  })
  const instanceInvites = createInstanceInviteRepository(db)
  const adminRows = createAdminRepository(db)
  const guilds = createGuildRepository(db)
  const channels = createChannelRepository(db)
  const roles = createRoleRepository(db)
  const overwrites = createOverwriteRepository(db)
  const access = createGuildAccess({ guilds, roles, overwrites })
  const emojiRows = createEmojiRepository(db)
  const views = createGuildViews({ channels, overwrites, emojis: emojiRows })
  const bans = createBanRepository(db)
  const audit = createAuditLogService({
    entries: createAuditLogRepository(db),
    access,
    views,
    nextId,
  })
  const relationships = createRelationshipRepository(db)
  const dmRows = createDmRepository(db)
  const dm = createDmService({ dms: dmRows, users, guilds, relationships, events, nextId })
  const channelEvents = createChannelEvents({ events, recipientIds: dmRows.recipientIds })
  const profileEvents = createProfileEvents({ events, guilds, relationships, dms: dmRows })

  const loginThrottle = redis ? createRedisLoginThrottle(redis) : createMemoryLoginThrottle()
  const mfa = createMfaService({
    users,
    mfa: createMfaRepository(db),
    tickets: redis ? createRedisMfaTickets(redis) : createMemoryMfaTickets(),
    loginThrottle,
    sessions,
    events,
  })
  const auth = createAuthService({
    users,
    sessions,
    nextId,
    events,
    sessionTtlDays: config.sessionTtlDays,
    registration: {
      mode: async () => (await instanceSettings.get()).registrationMode,
      consumeInvite: (code) => instanceInvites.consume(code, new Date()),
      releaseInvite: (code) => instanceInvites.release(code),
      isInitialAdmin: async (email) =>
        config.initialAdminEmail === email && !(await adminRows.hasAdmin()),
      async promote(user) {
        if (!config.initialAdminEmail) return adminRows.promoteIfFirst(user.id)
        if (user.email !== config.initialAdminEmail) return false
        return adminRows.promoteIfNoAdmin(user.id)
      },
    },
    loginThrottle,
    mfa,
    onPasswordChanged: (userId) =>
      createEmailTokenRepository(db).discardUnused(userId, 'reset_password', new Date()),
  })
  const accountEmails = createAccountEmailService({
    users,
    sessions,
    emailTokens: createEmailTokenRepository(db),
    mailer: mailer ?? createLogMailer(log),
    log,
    publicUrl: config.publicUrl,
    nextId,
    events,
    // The second factor's count stays: a reset by email mustn't buy new code guesses.
    onPasswordReset: async (userId) => {
      const user = await users.findById(userId)
      if (!user) return
      await loginThrottle.resetLogin(user.username)
      await loginThrottle.resetLogin(user.email)
    },
  })
  const guild = createGuildService({
    audit,
    db,
    guilds,
    roles,
    access,
    views,
    events,
    nextId,
    onDeleted: (deleted) => media.discardGuildFiles(deleted),
    ownedGuildLimit: async () => (await instanceSettings.get()).maxGuildsPerUser,
    filesOf: async (guildId) => (await emojiRows.listByGuild(guildId)).map(emojiKey),
    discardFiles: async (keys) => {
      if (!storage || keys.length === 0) return
      // Only costs space if it fails: nothing points at these objects any more.
      await storage.delete(keys).catch((error: unknown) => {
        log.warn({ err: error }, "Failed to delete a deleted server's files")
      })
    },
  })
  const admin = createAdminService({
    admin: adminRows,
    settings: instanceSettings,
    invites: instanceInvites,
    sessions,
    events,
    deleteGuild: (guildId) => guild.forceDelete(guildId),
  })
  const channel = createChannelService({
    audit,
    // Called at request time, when the message repository below exists.
    hasOthersMessages: (channelId, userId) => messageRows.hasOthersMessages(channelId, userId),
    db,
    channels,
    overwrites,
    roles,
    guilds,
    access,
    views,
    events,
    nextId,
    privatePermissions: dm.permissionsIn,
    // The voice service needs the channel service, so it is reached lazily.
    onVoiceChannelDeleted: (channelId, guildId) => voice.disconnectChannel(channelId, guildId),
  })
  const invite = createInviteService({
    db,
    invites: createInviteRepository(db),
    guilds,
    access,
    channels: channel,
    views,
    events,
    ...(presence ? { presence } : {}),
  })
  const readStates = createReadStateRepository(db)
  const notificationSettings = createNotificationRepository(db)
  const attachmentRows = createAttachmentRepository(db)
  const messageRows = createMessageRepository(db)
  const reactionRows = createReactionRepository(db)
  const messageViews = createMessageViews({
    messages: messageRows,
    attachmentRows,
    reactions: reactionRows,
    users,
  })
  const linkPreviews = config.linkPreviews
    ? createLinkPreviews({
        unfurl: createLinkUnfurler({
          fetchPage: createSafeFetcher({
            accept: (type) => type.startsWith('text/html'),
            ...linkFetchOverrides,
          }),
          fetchImage: createSafeFetcher({
            accept: (type) => type.startsWith('image/'),
            maxBytes: 4 * 1024 * 1024,
            maxRedirects: 1,
            ...linkFetchOverrides,
          }),
          storage,
          redis,
          log,
        }),
        messages: messageRows,
        channelRows: channels,
        views: messageViews,
        channelEvents,
      })
    : null
  const attachment = createAttachmentService({
    attachments: attachmentRows,
    channels: channel,
    storage,
    maxBytes: config.uploadMaxBytes,
    nextId,
    log,
  })
  // The worker announces previews through the message service, which nudges the worker.
  let previews: PreviewWorker | null = null
  const automod = createAutomodService({
    db,
    access,
    guilds,
    roles,
    events,
    audit,
    counters: redis ? createRedisAutomodCounters(redis) : createMemoryAutomodCounters(),
  })
  const thread = createThreadService({
    db,
    channels: channel,
    channelRows: channels,
    messages: messageRows,
    views,
    events,
    nextId,
  })
  const message = createMessageService({
    automod,
    onThreadMessages: (threadId, delta) => thread.countMessages(threadId, delta),
    onMessagesDeleted: (ids) => thread.forgetStarters(ids),
    visibleChannels: async (guildId, userId) =>
      (await views.detail(await access.requireMember(guildId, userId))).channels,
    audit,
    messages: messageRows,
    readStates,
    reactions: reactionRows,
    users,
    linkPreviews,
    resolveMentions: createMentionResolver({ guilds, roles, recipientIds: dmRows.recipientIds }),
    channels: channel,
    channelRows: channels,
    attachments: attachment,
    attachmentRows,
    events,
    channelEvents,
    onAttachmentsSent: () => previews?.nudge(),
    nextId,
    ...(redis ? { slowmode: createRedisSlowmode(redis) } : {}),
  })
  previews = storage
    ? createPreviewWorker({
        attachments: attachmentRows,
        storage,
        onReady: (row) => message.republish(row.channelId, row.messageId),
        log,
      })
    : null
  const media = createMediaService({
    users,
    guilds,
    access,
    storage,
    events,
    nextId,
    log,
    onProfileChanged: profileEvents.publish,
  })

  const role = createRoleService({
    audit,
    roles,
    overwrites,
    channels,
    guilds,
    access,
    views,
    events,
    nextId,
  })

  const voice = createVoiceService({
    config: config.voice,
    rooms: voiceRooms ?? (config.voice ? createLiveKitRooms(config.voice) : undefined),
    store: redis ? createVoiceStateStore(redis) : undefined,
    channels: channel,
    channelRows: channels,
    access,
    guilds,
    events,
    recipientIds: dmRows.recipientIds,
  })

  const reports = createReportService({
    reports: createReportRepository(db),
    channels: channel,
    channelRows: channels,
    overwrites,
    messages: messageRows,
    access,
    nextId,
  })
  const search = createSearchService({
    messages: messageRows,
    views: messageViews,
    access,
    channels: channel,
    channelRows: channels,
    overwrites,
  })
  const emoji = createEmojiService({
    db,
    emojis: emojiRows,
    access,
    storage,
    events,
    nextId,
    log,
  })
  const webhook = createWebhookService({
    db,
    publicUrl: config.publicUrl,
    audit,
    channels: channel,
    messages: message,
    nextId,
  })
  const bot = createBotService({ db, guilds, access, views, events, nextId })
  const accountDeletion = createAccountDeletion({
    db,
    admin: adminRows,
    events,
    deleteGuild: (guildId) => guild.forceDelete(guildId),
    storage,
    log,
    loginThrottle,
    mfa,
  })
  const command = createCommandService({
    db,
    access,
    channels: channel,
    messages: message,
    events,
    nextId,
  })
  const announcement = createAnnouncementService({
    db,
    channels: channel,
    messageRows,
    messages: message,
    webhooks: webhook,
    views: messageViews,
    channelEvents,
    log,
  })
  return {
    accountDeletion,
    bot,
    command,
    announcement,
    webhook,
    emoji,
    thread,
    search,
    automod,
    admin,
    reports,
    instanceSettings,
    role,
    mfa,
    repositories: {
      users,
      sessions,
      guilds,
      channels,
      readStates,
      notificationSettings,
      roles,
      overwrites,
      dms: dmRows,
      relationships,
    },
    profileEvents,
    profile: createProfileService({ users, guilds, access, relationships, dms: dmRows }),
    memberNickname: createMemberNicknameService({ access, guilds, users, roles, events, audit }),
    audit,
    moderation: createModerationService({
      access,
      guilds,
      roles,
      users,
      bans,
      audit,
      events,
      purgeMessages: (guildId, userId, seconds) => message.purgeAuthor(guildId, userId, seconds),
    }),
    access,
    views,
    auth,
    accountEmails,
    guild,
    channel,
    invite,
    message,
    attachment,
    previews,
    media,
    linkPreviews,
    mentionCounter: createMentionCounter({
      guilds,
      access,
      views,
      readStates,
      privateChannelIds: dm.privateChannelIds,
    }),
    relationship: createRelationshipService({
      db,
      relationships,
      users,
      events,
      presence,
      sharesGuild: guilds.sharesGuild,
    }),
    pin: createPinService({
      messages: messageRows,
      channels: channel,
      views: messageViews,
      channelEvents,
    }),
    reaction: createReactionService({
      reactions: reactionRows,
      messages: messageRows,
      channels: channel,
      channelEvents,
      // Server emoji only where they belong, under their real name.
      serverEmoji: async (guildId, emojiId) => {
        const found = await emojiRows.find(emojiId)
        return found?.guildId === guildId ? customEmojiText(found) : null
      },
    }),
    dm,
    voice,
    e2ee: createE2eeService({
      e2ee: createE2eeRepository(db),
      guilds,
      relationships,
      dms: dmRows,
      channels: channel,
      channelEvents,
      events,
      nextId,
    }),
    backup: createBackupService({ backups: createBackupRepository(db), nextId }),
    notification: createNotificationService({
      settings: notificationSettings,
      guilds,
      access,
      channels: channel,
      events,
    }),
    groupDm: createGroupDmService({
      dms: dmRows,
      users,
      relationships,
      events,
      nextId,
      note: (channelId, actorId, system) => message.createSystem(channelId, actorId, system),
    }),
  }
}

export type Services = ReturnType<typeof createServices>
