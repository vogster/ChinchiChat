import { has, MAX_INVITES_PER_GUILD, Permission } from '@chinchi/shared'
import { and, count, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'

import { uniqueViolationConstraint } from '../../db/errors'
import { invites as invitesTable } from '../../db/schema'
import { guildTopic, userTopic } from '../../events/event-bus'
import { badRequest, forbidden, HttpError } from '../../http/http-error'
import { toMember } from '../guilds/guild.mapper'
import { createGuildRepository } from '../guilds/guild.repository'
import { createBanRepository, lockMembership } from '../moderation/ban.repository'
import { createInviteRepository } from './invite.repository'
import { generateInviteCode } from './invite-code'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { ChannelService } from '../channels/channel.service'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { UserRow } from '../users/user.repository'
import type { InviteRepository, InviteWithRelations } from './invite.repository'
import type { Presence, Snowflake } from '@chinchi/shared'

export interface InviteView {
  readonly data: InviteWithRelations
  readonly memberCount: number
}

/** Online status lookup; absent when there is no realtime gateway (tests, single process). */
export interface PresenceLookup {
  visible(userIds: readonly Snowflake[]): Promise<Presence[]>
}

export interface InviteServiceDeps {
  readonly db: Database
  readonly invites: InviteRepository
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly channels: ChannelService
  readonly views: GuildViews
  readonly events: EventBus
  readonly presence?: PresenceLookup
  readonly now?: () => Date
}

const MAX_CODE_ATTEMPTS = 5
const unknownInvite = () => new HttpError(404, 'UNKNOWN_INVITE', 'Unknown or expired invite')

export const createInviteService = ({
  db,
  invites,
  guilds,
  access,
  channels,
  views,
  events,
  presence,
  now = () => new Date(),
}: InviteServiceDeps) => {
  const view = async (data: InviteWithRelations): Promise<InviteView> => ({
    data,
    memberCount: await guilds.countMembers(data.guild.id),
  })

  const insertWithFreshCode = async (
    values: Omit<Parameters<InviteRepository['insert']>[0], 'code'>,
  ): Promise<string> => {
    for (let attempt = 1; ; attempt += 1) {
      const code = generateInviteCode()
      try {
        await db.transaction(async (tx) => {
          // Counted under a per-server lock so parallel creations can't pass the cap.
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`invites:${values.guildId}`}, 0))`,
          )
          const [active] = await tx
            .select({ total: count() })
            .from(invitesTable)
            .where(
              and(
                eq(invitesTable.guildId, values.guildId),
                or(isNull(invitesTable.expiresAt), gt(invitesTable.expiresAt, now())),
                or(isNull(invitesTable.maxUses), lt(invitesTable.uses, invitesTable.maxUses)),
              ),
            )
          if (Number(active?.total ?? 0) >= MAX_INVITES_PER_GUILD) {
            throw badRequest('TOO_MANY_INVITES', 'This server has as many invites as allowed')
          }
          await createInviteRepository(tx).insert({ ...values, code })
        })
        return code
      } catch (error) {
        if (!uniqueViolationConstraint(error) || attempt >= MAX_CODE_ATTEMPTS) throw error
      }
    }
  }

  return {
    async create(
      channelId: Snowflake,
      userId: Snowflake,
      options: { maxAgeSeconds: number; maxUses: number },
    ): Promise<InviteView> {
      const { channel } = await channels.resolveGuild(channelId, userId, Permission.CreateInvite)
      if (channel.type === 'category' || channel.type === 'thread') {
        throw badRequest('INVALID_CHANNEL', 'Invites can only point to text or voice channels')
      }
      const code = await insertWithFreshCode({
        guildId: channel.guildId,
        channelId: channel.id,
        inviterId: userId,
        maxUses: options.maxUses === 0 ? null : options.maxUses,
        expiresAt:
          options.maxAgeSeconds === 0
            ? null
            : new Date(now().getTime() + options.maxAgeSeconds * 1000),
      })
      return view((await invites.findWithRelations(code)) as InviteWithRelations)
    },

    /** Public preview: anyone with the link may see where it leads. */
    async preview(code: string): Promise<InviteView> {
      const found = await invites.findActive(code, now())
      if (!found) throw unknownInvite()
      return view(found)
    },

    /** Joins the server; existing members pass through without using up the invite. */
    async accept(code: string, user: UserRow): Promise<Snowflake> {
      const userId = user.id
      const current = now()
      const found = await invites.findActive(code, current)
      if (!found) throw unknownInvite()
      const guildId = found.guild.id
      if (await guilds.findMember(guildId, userId)) return guildId

      await db.transaction(async (tx) => {
        // Banned people stay out; the lock keeps a ban landing right now from being missed.
        await lockMembership(tx, guildId, userId)
        if (await createBanRepository(tx).isBanned(guildId, userId)) {
          throw forbidden('BANNED', 'You are banned from this server')
        }
        if (!(await createInviteRepository(tx).consume(code, current))) throw unknownInvite()
        await createGuildRepository(tx).addMember(guildId, userId)
      })

      const member = await guilds.findMember(guildId, userId)
      // The newcomer gets the server as they are allowed to see it.
      const detail = await views.detail(await access.requireMember(guildId, userId))
      const presences = presence
        ? await presence.visible(await guilds.listMemberIdsOf([guildId]))
        : []
      await events.publish({
        topic: userTopic(userId),
        type: 'GUILD_CREATE',
        data: { ...detail, presences },
      })
      if (member) {
        await events.publish({
          topic: guildTopic(guildId),
          type: 'GUILD_MEMBER_ADD',
          data: { guildId, member: toMember({ member, user }) },
        })
      }
      // Members already there learn that the newcomer is online.
      const own = presences.find((p) => p.userId === userId)
      if (own) {
        await events.publish({ topic: guildTopic(guildId), type: 'PRESENCE_UPDATE', data: own })
      }
      return guildId
    },

    async listForGuild(guildId: Snowflake, userId: Snowflake): Promise<InviteView[]> {
      await access.requirePermission(guildId, userId, Permission.ManageGuild)
      return Promise.all((await invites.listForGuild(guildId)).map(view))
    },

    /** The inviter may revoke their own invite; MANAGE_GUILD may revoke any. */
    async revoke(code: string, userId: Snowflake): Promise<void> {
      const found = await invites.findWithRelations(code)
      if (!found) throw unknownInvite()
      const { permissions } = await access.requireMember(found.guild.id, userId)
      if (!has(permissions, Permission.ManageGuild) && found.invite.inviterId !== userId) {
        throw forbidden('MISSING_PERMISSIONS', 'You can only revoke your own invites')
      }
      await invites.delete(code)
    },
  }
}

export type InviteService = ReturnType<typeof createInviteService>
