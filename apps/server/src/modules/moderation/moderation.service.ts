import { computeBasePermissions, has, Permission } from '@chinchi/shared'

import { guildTopic, userTopic } from '../../events/event-bus'
import { forbidden, HttpError } from '../../http/http-error'
import { activeTimeout } from '../guilds/guild.mapper'
import { outranks } from '../guilds/outranks'
import { toPublicUser } from '../users/user.mapper'

import type { EventBus } from '../../events/event-bus'
import type { GuildRepository } from '../guilds/guild.repository'
import type { GuildAccess, GuildAccessChecks } from '../guilds/guild-access'
import type { RoleRepository } from '../roles/role.repository'
import type { UserRepository } from '../users/user.repository'
import type { AuditLogService } from './audit-log.service'
import type { BanRepository } from './ban.repository'
import type { Ban, Snowflake } from '@chinchi/shared'

export interface ModerationServiceDeps {
  readonly access: GuildAccessChecks
  readonly guilds: Pick<GuildRepository, 'findById' | 'removeMember' | 'setTimeout'>
  readonly roles: Pick<RoleRepository, 'memberRoleIds'>
  readonly users: Pick<UserRepository, 'findById'>
  readonly bans: BanRepository
  readonly audit: Pick<AuditLogService, 'record'>
  readonly events: EventBus
  /** Deletes a banned member's recent messages (the message service owns that). */
  readonly purgeMessages: (
    guildId: Snowflake,
    userId: Snowflake,
    seconds: number,
  ) => Promise<number>
}

const hierarchy = () =>
  forbidden('ROLE_HIERARCHY', 'You can only moderate members below your highest role')
const unknownMember = () => new HttpError(404, 'UNKNOWN_MEMBER', 'Unknown member')
const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')

/** Kick, ban and timeout: each needs its permission and a higher role than the target's. */
export const createModerationService = ({
  access,
  guilds,
  roles,
  users,
  bans,
  audit,
  events,
  purgeMessages,
}: ModerationServiceDeps) => {
  /** The target as a member (null if they are not one), refusing anyone at or above the actor. */
  const ranked = async (actor: GuildAccess, guildId: Snowflake, targetId: Snowflake) => {
    if (targetId === actor.member.userId) throw hierarchy()
    let target: GuildAccess | null = null
    try {
      target = await access.requireMember(guildId, targetId)
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
    }
    if (target && !outranks(actor, target)) throw hierarchy()
    return target
  }

  /** What leaving looks like, to the user and to the server. */
  const announceRemoval = async (guildId: Snowflake, userId: Snowflake) => {
    await events.publish({ topic: userTopic(userId), type: 'GUILD_DELETE', data: { id: guildId } })
    await events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_MEMBER_REMOVE',
      data: { guildId, userId },
    })
  }

  return {
    async kick(actorId: Snowflake, guildId: Snowflake, targetId: Snowflake, reason?: string) {
      const actor = await access.requirePermission(guildId, actorId, Permission.KickMembers)
      if (!(await ranked(actor, guildId, targetId))) throw unknownMember()
      await guilds.removeMember(guildId, targetId)
      await announceRemoval(guildId, targetId)
      await audit.record({
        guildId,
        action: 'member_kick',
        actorId,
        targetUserId: targetId,
        reason,
      })
    },

    /** Bans a member, or anyone who has been one; their recent messages may go too. */
    async ban(
      actorId: Snowflake,
      guildId: Snowflake,
      targetId: Snowflake,
      { reason, deleteMessageSeconds = 0 }: { reason?: string; deleteMessageSeconds?: number },
    ) {
      const actor = await access.requirePermission(guildId, actorId, Permission.BanMembers)
      const target = await ranked(actor, guildId, targetId)
      if (!target && !(await users.findById(targetId))) throw unknownUser()
      const removed = await bans.banAndRemove({
        guildId,
        userId: targetId,
        reason: reason ?? null,
        bannedBy: actorId,
      })
      if (removed) await announceRemoval(guildId, targetId)
      // Recorded before the purge: the ban stands even if deleting messages fails midway.
      await audit.record({
        guildId,
        action: 'member_ban',
        actorId,
        targetUserId: targetId,
        reason,
        data: { deleteMessageSeconds },
      })
      await purgeMessages(guildId, targetId, deleteMessageSeconds)
    },

    async unban(actorId: Snowflake, guildId: Snowflake, targetId: Snowflake) {
      await access.requirePermission(guildId, actorId, Permission.BanMembers)
      if (!(await bans.remove(guildId, targetId)))
        throw new HttpError(404, 'UNKNOWN_BAN', 'Not banned')
      await audit.record({ guildId, action: 'member_unban', actorId, targetUserId: targetId })
    },

    async listBans(actorId: Snowflake, guildId: Snowflake): Promise<Ban[]> {
      await access.requirePermission(guildId, actorId, Permission.BanMembers)
      const rows = await bans.list(guildId)
      return rows.map(({ ban, user }) => ({
        user: toPublicUser(user),
        reason: ban.reason,
        createdAt: ban.createdAt.toISOString(),
      }))
    },

    /** Starts, changes or (with null) lifts a timeout. */
    async timeout(
      actorId: Snowflake,
      guildId: Snowflake,
      targetId: Snowflake,
      { until, reason }: { until: string | null; reason?: string },
    ) {
      const actor = await access.requirePermission(guildId, actorId, Permission.ModerateMembers)
      const target = await ranked(actor, guildId, targetId)
      if (!target) throw unknownMember()
      // A timeout never applies to administrators; don't pretend it does.
      if (
        until !== null &&
        has(
          computeBasePermissions({ ...target.context, timedOut: false }),
          Permission.Administrator,
        )
      ) {
        throw forbidden('TIMEOUT_IMMUNE', 'Administrators cannot be timed out')
      }
      const member = await guilds.setTimeout(guildId, targetId, until ? new Date(until) : null)
      if (!member) throw unknownMember()
      await events.publish({
        topic: guildTopic(guildId),
        type: 'GUILD_MEMBER_UPDATE',
        data: {
          guildId,
          userId: targetId,
          roleIds: await roles.memberRoleIds(guildId, targetId),
          nickname: member.nickname,
          timeoutUntil: activeTimeout(member.timeoutUntil),
        },
      })
      await audit.record({
        guildId,
        action: 'member_timeout',
        actorId,
        targetUserId: targetId,
        reason,
        data: { until },
      })
    },
  }
}

export type ModerationService = ReturnType<typeof createModerationService>
