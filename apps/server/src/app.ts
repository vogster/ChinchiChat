import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

import { createMemoryEventBus } from './events/event-bus'
import { createDispatcher } from './gateway/dispatcher'
import { gatewayPlugin } from './gateway/gateway.routes'
import { createGuildStateLoader } from './gateway/guild-state-loader'
import { createPresence } from './gateway/presence'
import { createGatewaySessionStore } from './gateway/session-store'
import { createSnapshot } from './gateway/snapshot'
import { registerErrorHandlers } from './http/error-handler'
import { registerJsonParser } from './http/json-parser'
import { rateLimitPlugin } from './http/rate-limit'
import { createScheduler } from './jobs/scheduler'
import { createStorageCleanup } from './jobs/storage-cleanup'
import { loggerOptions } from './logger'
import { createMetrics, instrumentEventBus } from './metrics/metrics'
import { adminRoutes } from './modules/admin/admin.routes'
import { announcementsRoutes } from './modules/announcements/announcements.routes'
import { createAttachmentRepository } from './modules/attachments/attachment.repository'
import { attachmentsRoutes } from './modules/attachments/attachments.routes'
import { accountRoutes } from './modules/auth/account.routes'
import { authPlugin } from './modules/auth/auth.plugin'
import { authRoutes } from './modules/auth/auth.routes'
import { mfaRoutes } from './modules/auth/mfa.routes'
import { confirmIdentity } from './modules/auth/reauth'
import { sessionsRoutes } from './modules/auth/sessions.routes'
import { automodRoutes } from './modules/automod/automod.routes'
import { botsRoutes } from './modules/bots/bots.routes'
import { channelsRoutes } from './modules/channels/channels.routes'
import { threadsRoutes } from './modules/channels/threads.routes'
import { commandsRoutes } from './modules/commands/commands.routes'
import { dmsRoutes } from './modules/dms/dms.routes'
import { approvalRoutes } from './modules/e2ee/approval.routes'
import { backupRoutes } from './modules/e2ee/backup.routes'
import { e2eeRoutes } from './modules/e2ee/e2ee.routes'
import { embedsRoutes } from './modules/embeds/embeds.routes'
import { emojisRoutes } from './modules/emojis/emojis.routes'
import { createDataExport } from './modules/export/data-export'
import { createExportRepository } from './modules/export/export.repository'
import { exportRoutes } from './modules/export/export.routes'
import {
  createMemoryExportTickets,
  createRedisExportTickets,
} from './modules/export/export-tickets'
import { guildsRoutes } from './modules/guilds/guilds.routes'
import { membersRoutes } from './modules/guilds/members.routes'
import { healthRoutes } from './modules/health/health.routes'
import { instanceRoutes } from './modules/instance/instance.routes'
import { invitesRoutes } from './modules/invites/invites.routes'
import { mediaRoutes } from './modules/media/media.routes'
import { messagesRoutes } from './modules/messages/messages.routes'
import { pinsRoutes } from './modules/messages/pins.routes'
import { pollsRoutes } from './modules/messages/polls.routes'
import { reactionsRoutes } from './modules/messages/reactions.routes'
import { searchRoutes } from './modules/messages/search.routes'
import { moderationRoutes } from './modules/moderation/moderation.routes'
import { notificationsRoutes } from './modules/notifications/notifications.routes'
import { relationshipsRoutes } from './modules/relationships/relationships.routes'
import { reportsRoutes } from './modules/reports/reports.routes'
import { rolesRoutes } from './modules/roles/roles.routes'
import { customStatusRoutes } from './modules/users/custom-status.routes'
import { toCurrentUser } from './modules/users/user.mapper'
import { usersRoutes } from './modules/users/users.routes'
import { voiceRoutes } from './modules/voice/voice.routes'
import { createVoiceGuard } from './modules/voice/voice-guard'
import { voiceWebhookRoutes } from './modules/voice/voice-webhook.routes'
import { webhooksRoutes } from './modules/webhooks/webhooks.routes'
import { createServices } from './services'

import type { Config } from './config/env'
import type { Database } from './db/client'
import type { EventBus } from './events/event-bus'
import type { PresenceService } from './gateway/presence'
import type { Scheduler } from './jobs/scheduler'
import type { Mailer } from './mail/mailer'
import type { Metrics } from './metrics/metrics'
import type { PreviewWorker } from './modules/attachments/preview-worker'
import type { LinkPreviews } from './modules/embeds/link-previews'
import type { UserRow } from './modules/users/user.repository'
import type { VoiceService } from './modules/voice/voice.service'
import type { ServiceDeps, Services } from './services'
import type { ObjectStorage } from './storage/object-storage'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import type { Redis } from 'ioredis'

export interface AppDependencies {
  readonly db: Database
  /** Required in production (rate limits, gateway); unit tests may omit it. */
  readonly redis?: Redis
  /** Defaults to a mailer that only logs (no SMTP configured). */
  readonly mailer?: Mailer
  /** Realtime fan-out; defaults to an in-process bus (single server, tests). */
  readonly events?: EventBus
  /** Object storage for uploads; without it uploads are disabled. */
  readonly storage?: ObjectStorage
  /** Tests only: lets link previews reach a local test site. */
  readonly linkFetchOverrides?: ServiceDeps['linkFetchOverrides']
  /** Tests only: replaces LiveKit's room API. */
  readonly voiceRooms?: ServiceDeps['voiceRooms']
  /** Prometheus metrics; a fresh registry by default. */
  readonly metrics?: Metrics
  /** Where the first admin's confirmation link goes without SMTP; the log by default. */
  readonly reportFirstAdminLink?: ServiceDeps['reportFirstAdminLink']
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Voice (LiveKit); `reconcile` drops connections LiveKit no longer has. */
    voice: VoiceService
    /** Background image previews; null without object storage. Started by the entrypoint. */
    previews: PreviewWorker | null
    /** Background link previews; null when LINK_PREVIEWS=off. */
    linkPreviews: LinkPreviews | null
    /** Prometheus metrics, served by the entrypoint on METRICS_PORT. */
    metrics: Metrics
    /** Periodic cluster-wide jobs (cleanup, sweeps); null without Valkey. Started by the entrypoint. */
    scheduler: Scheduler | null
  }
}

export const API_PREFIX = '/api/v1'

/** Fastify's types omit the hop-count form, so hops become the equivalent trust function. */
const toFastifyTrustProxy = (value: Config['trustProxy']): FastifyServerOptions['trustProxy'] => {
  if (typeof value === 'number') return (_address: string, hop: number) => hop < value
  return typeof value === 'boolean' ? value : [...value]
}

const registerGateway = (
  app: FastifyInstance,
  config: Config,
  services: Services,
  presence: PresenceService,
  redis: Redis,
  events: EventBus,
  metrics: Metrics,
) => {
  const { guilds, readStates, notificationSettings } = services.repositories
  const guildIdsFor = (userId: string) => guilds.listGuildIdsOf(userId)

  app.register(gatewayPlugin, {
    path: `${API_PREFIX}/gateway`,
    webOrigins: config.webOrigins,
    dispatcher: createDispatcher(events),
    metrics,
    deps: {
      onDispatch: (type) => metrics.gatewayDispatches.inc({ type }),
      onReady: (seconds) => metrics.gatewayReady.observe(seconds),
      heartbeatMs: config.gatewayHeartbeatMs,
      events,
      sessions: createGatewaySessionStore(redis),
      presence,
      authenticate: (token) => services.auth.authenticate(token),
      guildIdsFor,
      snapshot: createSnapshot({
        guilds,
        access: services.access,
        views: services.views,
        presence,
        readStates,
        notificationSettings,
        mentionCounter: services.mentionCounter,
        dms: services.dm,
        friendIdsFor: (userId) => services.repositories.relationships.friendIdsOf(userId),
        voice: services.voice,
      }),
      toCurrentUser: (auth) => toCurrentUser(auth.user),
      loadGuildState: createGuildStateLoader({
        access: services.access,
        channels: services.repositories.channels,
        overwrites: services.repositories.overwrites,
      }),
    },
  })
}

export const buildApp = (
  config: Config,
  {
    db,
    redis,
    mailer,
    storage,
    linkFetchOverrides,
    voiceRooms,
    reportFirstAdminLink,
    events: rawEvents = createMemoryEventBus(),
    metrics = createMetrics(),
  }: AppDependencies,
): FastifyInstance => {
  // Makes request.ip (rate limits, session IPs) the real client behind a reverse proxy.
  const app = Fastify({
    logger: config.env === 'test' ? false : loggerOptions(config),
    trustProxy: toFastifyTrustProxy(config.trustProxy),
    // Encoded emoji sequences in reaction URLs can exceed the default 100 characters.
    maxParamLength: 256,
  })

  const events = instrumentEventBus(rawEvents, metrics)
  app.decorate('metrics', metrics)
  // Labeled by route pattern: ids in URLs would make a series per message.
  app.addHook('onResponse', async (request, reply) => {
    metrics.httpDuration.observe(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status_code: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    )
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandlers(app)
  registerJsonParser(app)

  // Presence needs repositories and services need presence: resolve the cycle lazily.
  let presence: PresenceService | undefined
  const services = createServices(config, {
    db,
    events,
    mailer,
    storage,
    redis,
    ...(linkFetchOverrides ? { linkFetchOverrides } : {}),
    ...(voiceRooms ? { voiceRooms } : {}),
    ...(reportFirstAdminLink ? { reportFirstAdminLink } : {}),
    log: app.log,
    presence: {
      visible: (userIds) => (presence ? presence.visible(userIds) : Promise.resolve([])),
    },
  })
  if (redis) {
    const { guilds } = services.repositories
    presence = createPresence({
      redis,
      events,
      guildIdsFor: (userId) => guilds.listGuildIdsOf(userId),
      friendIdsFor: (userId) => services.repositories.relationships.friendIdsOf(userId),
      // A device stays "connected" for a while after its last heartbeat.
      ttlMs: config.gatewayHeartbeatMs * 2.5,
    })
  }

  const scheduler = redis
    ? createScheduler({
        redis,
        metrics,
        onError: (name, error) => app.log.error({ err: error, job: name }, 'Background job failed'),
        jobs: [
          // Devices of a crashed process go offline within a TTL plus this interval.
          ...(presence
            ? [
                {
                  name: 'presence-sweep',
                  everyMs: 30_000,
                  run: async () => void (await presence?.sweep()),
                },
              ]
            : []),
          {
            name: 'storage-cleanup',
            everyMs: 60 * 60_000,
            run: async () => {
              const result = await createStorageCleanup({ db, storage, redis }).run()
              app.log.info(result, 'Storage cleanup done')
            },
          },
        ],
      })
    : null
  app.decorate('scheduler', scheduler)
  app.decorate('previews', services.previews)
  app.decorate('linkPreviews', services.linkPreviews)
  app.decorate('voice', services.voice)
  const voiceGuard = createVoiceGuard({
    events,
    voice: services.voice,
    log: app.log,
    // Tests reconcile on demand (app.voice.reconcile()) instead of on a timer.
    reconcileEveryMs: config.env === 'test' ? 0 : 60_000,
  })
  if (services.voice.enabled) voiceGuard.start()
  app.addHook('onClose', async () => {
    await scheduler?.stop()
    voiceGuard.stop()
    await services.previews?.stop()
    // Running link previews still write to the database; queued ones are dropped.
    await services.linkPreviews?.close()
  })

  app.register(rateLimitPlugin, {
    enabled: config.rateLimitEnabled,
    redis,
    onStoreError: (error) => {
      metrics.rateLimitStoreErrors.inc()
      app.log.warn({ err: error }, 'Rate limit check failed: Valkey did not answer')
    },
  })
  app.register(cookie)
  app.register(authPlugin, {
    authService: services.auth,
    webOrigins: config.webOrigins,
    requireVerifiedEmail: async () => (await services.instanceSettings.get()).requireVerifiedEmail,
  })
  app.register(healthRoutes, { db, redis })
  if (redis && presence) registerGateway(app, config, services, presence, redis, events, metrics)

  /** The password, and a 2FA code when it is on: before what a stolen session must not do. */
  const reauth = (user: UserRow, password: string, code: string | undefined) =>
    confirmIdentity({ throttle: services.loginThrottle, mfa: services.mfa }, user, password, code)

  app.register(
    async (api) => {
      api.register(authRoutes, {
        authService: services.auth,
        accountEmails: services.accountEmails,
        sessionTtlDays: config.sessionTtlDays,
        // Also when NODE_ENV is left unset on a site served over HTTPS.
        secureCookies: config.env === 'production' || config.publicUrl.startsWith('https:'),
        qrLogin: services.qrLogin,
      })
      api.register(accountRoutes, {
        accountEmails: services.accountEmails,
        loginThrottle: services.loginThrottle,
        mfa: services.mfa,
      })
      api.register(mfaRoutes, { mfaService: services.mfa })
      api.register(sessionsRoutes, { authService: services.auth })
      api.register(usersRoutes, {
        users: services.repositories.users,
        profileEvents: services.profileEvents,
        profileService: services.profile,
        accountDeletion: services.accountDeletion,
        onDmPolicyChanged: async (userId) => {
          const channelIds = await services.dm.privateChannelIds(userId)
          await Promise.all(channelIds.map((id) => services.voice.revalidateDm(id)))
        },
      })
      api.register(guildsRoutes, { guildService: services.guild })
      api.register(channelsRoutes, { channelService: services.channel })
      api.register(invitesRoutes, { inviteService: services.invite, guildService: services.guild })
      api.register(messagesRoutes, {
        messageService: services.message,
        mentionCounter: services.mentionCounter,
      })
      api.register(attachmentsRoutes, { attachmentService: services.attachment })
      api.register(reactionsRoutes, { reactionService: services.reaction })
      api.register(pollsRoutes, { pollService: services.poll })
      api.register(pinsRoutes, { pinService: services.pin })
      api.register(embedsRoutes, { storage })
      api.register(relationshipsRoutes, { relationshipService: services.relationship })
      api.register(notificationsRoutes, { notificationService: services.notification })
      if (presence) api.register(customStatusRoutes, { presence })
      api.register(e2eeRoutes, {
        e2eeService: services.e2ee,
        confirmIdentity: reauth,
      })
      api.register(backupRoutes, { backupService: services.backup })
      api.register(approvalRoutes, { approvalService: services.approval })
      api.register(exportRoutes, {
        tickets: redis ? createRedisExportTickets(redis) : createMemoryExportTickets(),
        confirmIdentity: reauth,
        dataExport: createDataExport({
          exports: createExportRepository(db),
          attachments: createAttachmentRepository(db),
          relationships: services.repositories.relationships,
          storage,
          log: app.log,
        }),
      })
      api.register(dmsRoutes, {
        dmService: services.dm,
        groupDmService: services.groupDm,
        dmVisibility: services.dmVisibility,
      })
      api.register(mediaRoutes, { mediaService: services.media })
      api.register(rolesRoutes, { roleService: services.role })
      api.register(instanceRoutes, {
        instance: async () => {
          const settings = await services.instanceSettings.get()
          return {
            name: config.instanceName,
            registrationMode: settings.registrationMode,
            uploads: services.attachment.limits(),
            voice: services.voice.enabled,
            requireVerifiedEmail: settings.requireVerifiedEmail,
          }
        },
      })
      api.register(adminRoutes, {
        adminService: services.admin,
        accountDeletion: services.accountDeletion,
      })
      api.register(reportsRoutes, { reportService: services.reports })
      api.register(automodRoutes, { automodService: services.automod })
      api.register(searchRoutes, { searchService: services.search })
      api.register(threadsRoutes, { threadService: services.thread })
      api.register(emojisRoutes, { emojiService: services.emoji })
      api.register(webhooksRoutes, { webhookService: services.webhook })
      api.register(botsRoutes, { botService: services.bot })
      api.register(commandsRoutes, { commandService: services.command })
      api.register(announcementsRoutes, { announcementService: services.announcement })
      api.register(voiceRoutes, { voiceService: services.voice })
      api.register(membersRoutes, { memberNicknameService: services.memberNickname })
      api.register(moderationRoutes, {
        moderationService: services.moderation,
        auditLogService: services.audit,
      })
      api.register(voiceWebhookRoutes, { config: config.voice, voiceService: services.voice })
    },
    { prefix: API_PREFIX },
  )

  return app
}
