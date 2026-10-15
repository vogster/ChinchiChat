import { randomBytes } from 'node:crypto'

import { publishRevokedSessions } from '../../events/internal-events'
import { HttpError, badRequest } from '../../http/http-error'
import { profileImageUrl } from '../media/media-paths'
import { toPublicUser } from '../users/user.mapper'

import type { EventBus } from '../../events/event-bus'
import type { SessionRepository } from '../auth/session.repository'
import type { UserRow } from '../users/user.repository'
import type { AdminRepository } from './admin.repository'
import type {
  InstanceInviteRepository,
  InstanceInviteRow,
  InstanceSettingsStore,
} from './instance-settings'
import type {
  AdminGuild,
  AdminUser,
  InstanceInvite,
  InstanceSettings,
  Snowflake,
  UpdateAdminUserRequest,
} from '@chinchi/shared'

export interface AdminServiceDeps {
  readonly admin: AdminRepository
  readonly settings: InstanceSettingsStore
  readonly invites: InstanceInviteRepository
  readonly sessions: Pick<SessionRepository, 'deleteAllForUser'>
  readonly events: EventBus
  /** Deletes a server the way its owner would (events, voice, files). */
  readonly deleteGuild: (guildId: Snowflake) => Promise<void>
  readonly now?: () => Date
}

interface Page {
  readonly query?: string | undefined
  readonly before?: Snowflake | undefined
  readonly limit: number
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** 16 characters from an unambiguous alphabet (~93 bits). */
const newInviteCode = () =>
  [...randomBytes(16)].map((byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join('')

const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')

export const toAdminUser = (user: UserRow): AdminUser => ({
  user: toPublicUser(user),
  email: user.email,
  isAdmin: user.isAdmin,
  suspended: user.suspendedAt !== null,
  mfaEnabled: user.totpSecret !== null,
  createdAt: user.createdAt.toISOString(),
})

const toInstanceInvite = (invite: InstanceInviteRow, creator: UserRow | null): InstanceInvite => ({
  code: invite.code,
  uses: invite.uses,
  maxUses: invite.maxUses,
  expiresAt: invite.expiresAt?.toISOString() ?? null,
  createdBy: creator ? toPublicUser(creator) : null,
  createdAt: invite.createdAt.toISOString(),
})

/** What instance admins do: users, servers, registration and limits. */
export const createAdminService = ({
  admin,
  settings,
  invites,
  sessions,
  events,
  deleteGuild,
  now = () => new Date(),
}: AdminServiceDeps) => ({
  settings: (): Promise<InstanceSettings> => settings.get(),

  async updateSettings(changes: Partial<InstanceSettings>): Promise<InstanceSettings> {
    await settings.update(changes)
    return settings.get()
  },

  async listUsers(page: Page): Promise<AdminUser[]> {
    return (await admin.listUsers(page)).map(toAdminUser)
  },

  /** Admins can't change their own account here, so nobody locks themselves out. */
  async updateUser(
    actorId: Snowflake,
    userId: Snowflake,
    { suspended, admin: makeAdmin }: UpdateAdminUserRequest,
  ): Promise<AdminUser> {
    if (actorId === userId) {
      throw badRequest('CANNOT_MODIFY_SELF', 'Ask another admin to change your account')
    }
    const user = await admin.update(userId, {
      ...(makeAdmin !== undefined ? { isAdmin: makeAdmin } : {}),
      ...(suspended !== undefined ? { suspendedAt: suspended ? now() : null } : {}),
    })
    if (!user) throw unknownUser()
    if (suspended) {
      // Ends every session; the voice guard drops them from calls on the same event.
      await sessions.deleteAllForUser(userId)
      await publishRevokedSessions(events, userId, { scope: 'all' })
      // Their bots stop too: tokens stay, but don't sign in while the owner is suspended.
      for (const botId of await admin.botIdsOf(userId)) {
        await publishRevokedSessions(events, botId, { scope: 'all' })
      }
    }
    return toAdminUser(user)
  },

  async listGuilds(page: Page): Promise<AdminGuild[]> {
    return (await admin.listGuilds(page)).map(({ guild, owner, memberCount }) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: profileImageUrl('icons', guild.id, guild.iconId),
      owner: owner ? toPublicUser(owner) : null,
      memberCount,
      createdAt: guild.createdAt.toISOString(),
    }))
  },

  deleteGuild,

  async listInvites(): Promise<InstanceInvite[]> {
    return (await invites.list()).map(({ invite, creator }) => toInstanceInvite(invite, creator))
  },

  async createInvite(
    actorId: Snowflake,
    { maxUses, expiresInSeconds }: { maxUses: number | null; expiresInSeconds: number | null },
  ): Promise<InstanceInvite> {
    const created = await invites.insert({
      code: newInviteCode(),
      createdBy: actorId,
      maxUses,
      expiresAt: expiresInSeconds ? new Date(now().getTime() + expiresInSeconds * 1000) : null,
    })
    const found = await invites.find(created.code)
    return toInstanceInvite(created, found?.creator ?? null)
  },

  async revokeInvite(code: string): Promise<void> {
    if (!(await invites.delete(code))) {
      throw new HttpError(404, 'UNKNOWN_INVITE', 'Unknown invite')
    }
  },
})

export type AdminService = ReturnType<typeof createAdminService>
