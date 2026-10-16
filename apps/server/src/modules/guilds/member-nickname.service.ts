import { Permission } from '@chinchi/shared'

import { guildTopic } from '../../events/event-bus'
import { forbidden, HttpError } from '../../http/http-error'
import { activeTimeout, toMember } from './guild.mapper'
import { outranks } from './outranks'

import type { EventBus } from '../../events/event-bus'
import type { AuditLogService } from '../moderation/audit-log.service'
import type { RoleRepository } from '../roles/role.repository'
import type { UserRepository } from '../users/user.repository'
import type { GuildRepository } from './guild.repository'
import type { GuildAccessChecks } from './guild-access'
import type { Member, Snowflake } from '@chinchi/shared'

export interface MemberNicknameServiceDeps {
  readonly access: GuildAccessChecks
  readonly guilds: Pick<GuildRepository, 'setNickname'>
  readonly users: Pick<UserRepository, 'findById'>
  readonly roles: Pick<RoleRepository, 'memberRoleIds'>
  readonly events: EventBus
  readonly audit: Pick<AuditLogService, 'record'>
}

/** Server nicknames: your own with CHANGE_NICKNAME, others' with MANAGE_NICKNAMES and rank. */
export const createMemberNicknameService = ({
  access,
  guilds,
  users,
  roles,
  events,
  audit,
}: MemberNicknameServiceDeps) => ({
  async set(
    actorId: Snowflake,
    guildId: Snowflake,
    targetId: Snowflake,
    nickname: string | null,
  ): Promise<Member> {
    const own = actorId === targetId
    const actor = await access.requirePermission(
      guildId,
      actorId,
      own ? Permission.ChangeNickname : Permission.ManageNicknames,
    )
    const target = own
      ? actor
      : await access.requireMember(guildId, targetId).catch((error: unknown) => {
          if (error instanceof HttpError)
            throw new HttpError(404, 'UNKNOWN_MEMBER', 'Unknown member')
          throw error
        })
    if (!own && !outranks(actor, target)) {
      throw forbidden('ROLE_HIERARCHY', 'You can only rename members below your highest role')
    }
    const [member, user] = await Promise.all([
      guilds.setNickname(guildId, targetId, nickname),
      users.findById(targetId),
    ])
    if (!member || !user) throw new HttpError(404, 'UNKNOWN_MEMBER', 'Unknown member')
    // Read after the update, so a role change made meanwhile isn't overwritten in clients' caches.
    const roleIds = await roles.memberRoleIds(guildId, targetId)
    await events.publish({
      topic: guildTopic(guildId),
      type: 'GUILD_MEMBER_UPDATE',
      data: {
        guildId,
        userId: targetId,
        roleIds,
        nickname: member.nickname,
        timeoutUntil: activeTimeout(member.timeoutUntil),
      },
    })
    if (!own) {
      await audit.record({
        guildId,
        action: 'member_nickname',
        actorId,
        targetUserId: targetId,
        data: { nickname: member.nickname },
      })
    }
    return toMember({ member, user }, roleIds)
  },
})

export type MemberNicknameService = ReturnType<typeof createMemberNicknameService>
