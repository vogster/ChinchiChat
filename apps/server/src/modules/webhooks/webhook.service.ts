import { timingSafeEqual } from 'node:crypto'
import { MAX_WEBHOOKS_PER_CHANNEL, Permission } from '@chinchi/shared'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { channels as channelsTable, guildMembers, users, webhooks } from '../../db/schema'
import { badRequest, conflict, HttpError } from '../../http/http-error'
import { generateSessionToken, hashSessionToken } from '../auth/session-token'
import { toPublicUser } from '../users/user.mapper'

import type { Database } from '../../db/client'
import type { ChannelService } from '../channels/channel.service'
import type { MessageService } from '../messages/message.service'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { UserRow } from '../users/user.repository'
import type { Snowflake, Webhook } from '@chinchi/shared'

type WebhookRow = typeof webhooks.$inferSelect

export interface WebhookServiceDeps {
  readonly db: Database
  /** Public address of the instance: the secret URL is shown absolute, ready to paste. */
  readonly publicUrl: string
  readonly audit: Pick<AuditLogService, 'record'>
  readonly channels: Pick<ChannelService, 'resolveGuild'>
  readonly messages: Pick<MessageService, 'createFromWebhook'>
  readonly nextId: () => Snowflake
}

/** The announcement channel a follower webhook carries. */
const source = alias(channelsTable, 'source')

const unknownWebhook = () => new HttpError(404, 'UNKNOWN_WEBHOOK', 'Unknown webhook')

const toWebhook = (
  row: WebhookRow,
  creator: UserRow | null,
  sourceGuildId: Snowflake | null,
): Webhook => ({
  id: row.id,
  guildId: row.guildId,
  channelId: row.channelId,
  name: row.name,
  createdBy: creator ? toPublicUser(creator) : null,
  createdAt: row.createdAt.toISOString(),
  sourceChannelId: row.sourceChannelId,
  sourceGuildId,
})

/** Channels that may follow one announcement channel. */
const MAX_FOLLOWERS_PER_CHANNEL = 100
/** The secret URL a service posts to; shown once, when the webhook is created. */
const webhookUrl = (id: Snowflake, token: string) => `/api/v1/webhooks/${id}/${token}`

/** Incoming webhooks: managed by those who manage the channel, used by whoever has the URL. */
export const createWebhookService = ({
  db,
  publicUrl,
  audit,
  channels,
  messages,
  nextId,
}: WebhookServiceDeps) => {
  const isMember = async (guildId: Snowflake, userId: Snowflake) =>
    (
      await db
        .select({ userId: guildMembers.userId })
        .from(guildMembers)
        .where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId)))
        .limit(1)
    ).length > 0

  const manageable = (channelId: Snowflake, userId: Snowflake) =>
    channels.resolveGuild(channelId, userId, Permission.ManageChannels)

  /** Webhooks with who made them and, for followers, the server of the channel they carry. */
  const withCreators = () =>
    db
      .select({ webhook: webhooks, creator: users, sourceGuildId: source.guildId })
      .from(webhooks)
      .leftJoin(users, eq(users.id, webhooks.createdBy))
      .leftJoin(source, eq(source.id, webhooks.sourceChannelId))

  return {
    async list(channelId: Snowflake, userId: Snowflake): Promise<Webhook[]> {
      const { channel } = await manageable(channelId, userId)
      const rows = await withCreators()
        .where(eq(webhooks.channelId, channel.id))
        .orderBy(desc(webhooks.id))
      return rows.map(({ webhook, creator, sourceGuildId }) =>
        toWebhook(webhook, creator, sourceGuildId),
      )
    },

    async create(
      channelId: Snowflake,
      userId: Snowflake,
      name: string,
      /** Follower webhooks: the announcement channel they carry (one per target channel). */
      sourceChannelId: Snowflake | null = null,
    ): Promise<{ webhook: Webhook; url: string }> {
      const { channel } = await manageable(channelId, userId)
      if (channel.type !== 'text') {
        throw badRequest('INVALID_CHANNEL', 'Webhooks post into text channels')
      }
      const { token, tokenHash } = generateSessionToken()
      const row = await db.transaction(async (tx) => {
        // Counted under a per-channel lock so parallel creations can't pass the cap.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`webhooks:${channel.id}`}, 0))`,
        )
        const [existing] = await tx
          .select({ total: count() })
          .from(webhooks)
          .where(eq(webhooks.channelId, channel.id))
        if (Number(existing?.total ?? 0) >= MAX_WEBHOOKS_PER_CHANNEL) {
          throw badRequest('TOO_MANY_WEBHOOKS', 'This channel has as many webhooks as allowed')
        }
        if (sourceChannelId) {
          // Each publish copies into every follower: their number is capped per source.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`followers:${sourceChannelId}`}, 0))`,
          )
          const [followers] = await tx
            .select({ total: count() })
            .from(webhooks)
            .where(eq(webhooks.sourceChannelId, sourceChannelId))
          if (Number(followers?.total ?? 0) >= MAX_FOLLOWERS_PER_CHANNEL) {
            throw badRequest('TOO_MANY_FOLLOWERS', 'That channel has as many followers as allowed')
          }
          const [following] = await tx
            .select({ id: webhooks.id })
            .from(webhooks)
            .where(
              and(
                eq(webhooks.channelId, channel.id),
                eq(webhooks.sourceChannelId, sourceChannelId),
              ),
            )
          if (following)
            throw conflict('ALREADY_FOLLOWING', 'This channel already follows that one')
        }
        const [inserted] = await tx
          .insert(webhooks)
          .values({
            id: nextId(),
            guildId: channel.guildId,
            channelId: channel.id,
            name,
            tokenHash,
            createdBy: userId,
            sourceChannelId,
          })
          .returning()
        return inserted as WebhookRow
      })
      const [created] = await withCreators().where(eq(webhooks.id, row.id))
      // Whoever holds the URL bypasses slowmode and automod: worth a line in the journal.
      await audit.record({
        guildId: row.guildId,
        action: 'webhook_create',
        actorId: userId,
        targetId: row.id,
        data: { name: row.name, channelId: row.channelId, sourceChannelId },
      })
      return {
        webhook: toWebhook(row, created?.creator ?? null, created?.sourceGuildId ?? null),
        url: `${publicUrl.replace(/\/$/, '')}${webhookUrl(row.id, token)}`,
      }
    },

    async delete(webhookId: Snowflake, userId: Snowflake): Promise<void> {
      const [row] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId))
      if (!row) throw unknownWebhook()
      // Someone who can't manage (or see) its channel learns nothing about it.
      await manageable(row.channelId, userId).catch((error: unknown) => {
        if (error instanceof HttpError && error.statusCode < 500) throw unknownWebhook()
        throw error
      })
      await db.delete(webhooks).where(and(eq(webhooks.id, webhookId)))
      await audit.record({
        guildId: row.guildId,
        action: 'webhook_delete',
        actorId: userId,
        targetId: row.id,
        data: { name: row.name, channelId: row.channelId, sourceChannelId: row.sourceChannelId },
      })
    },

    /**
     * Ends a follow: the follower webhook goes, with a line in the journal. Who may do it (the
     * following channel's or the source's managers) is the caller's check.
     */
    async removeFollower(webhookId: Snowflake, userId: Snowflake): Promise<void> {
      const [row] = await db.delete(webhooks).where(eq(webhooks.id, webhookId)).returning()
      if (!row) return
      await audit.record({
        guildId: row.guildId,
        action: 'webhook_delete',
        actorId: userId,
        targetId: row.id,
        data: { name: row.name, channelId: row.channelId, sourceChannelId: row.sourceChannelId },
      })
    },

    /** Posts as the webhook; the token is compared in constant time against its hash. */
    async execute(
      webhookId: Snowflake,
      token: string,
      { content, username }: { content: string; username?: string | undefined },
    ): Promise<void> {
      const [row] = await db.select().from(webhooks).where(eq(webhooks.id, webhookId))
      const given = Buffer.from(hashSessionToken(token))
      if (!row || !timingSafeEqual(given, Buffer.from(row.tokenHash))) throw unknownWebhook()
      // Follower webhooks only carry published announcements.
      if (row.sourceChannelId) throw unknownWebhook()
      // Whoever set it up left the server (kicked, banned): their saved URL stops with them.
      if (row.createdBy && !(await isMember(row.guildId, row.createdBy))) throw unknownWebhook()
      await messages.createFromWebhook(
        row.channelId,
        { id: row.id, name: username ?? row.name },
        content,
      )
    },
  }
}

export type WebhookService = ReturnType<typeof createWebhookService>
