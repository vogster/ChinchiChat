import { eq, inArray } from 'drizzle-orm'

import { guildMembers, guilds, users } from '../../db/schema'
import { guildTopic } from '../../events/event-bus'
import { publishRevokedSessions } from '../../events/internal-events'
import { badRequest, HttpError } from '../../http/http-error'
import { confirmPassword } from '../auth/reauth'
import { profileImageKey } from '../media/media-paths'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { ObjectStorage } from '../../storage/object-storage'
import type { AdminRepository } from '../admin/admin.repository'
import type { LoginThrottle } from '../auth/login-throttle'
import type { MfaService } from '../auth/mfa.service'
import type { UserRow } from './user.repository'
import type { Snowflake } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'

export interface AccountDeletionDeps {
  readonly db: Database
  readonly admin: Pick<AdminRepository, 'deleteUser' | 'isLastAdmin'>
  readonly events: EventBus
  /** Deletes a server with everything in it (and tells its members). */
  readonly deleteGuild: (guildId: Snowflake) => Promise<void>
  readonly storage?: ObjectStorage | undefined
  readonly log?: Pick<FastifyBaseLogger, 'warn'>
  /** Counts password attempts per account (shared with sign-in). */
  readonly loginThrottle: LoginThrottle
  /** Second factor: accounts that have it confirm with a code too. */
  readonly mfa?: Pick<MfaService, 'verify'>
}

const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')

/**
 * Deleting an account. Messages stay, shown as a deleted user (their author is set null);
 * sessions, memberships, relationships, reactions and the user's bots go with it. Owned
 * servers block a self-deletion (transfer or delete them first); an admin removes them too.
 */
export const createAccountDeletion = ({
  db,
  admin,
  events,
  deleteGuild,
  storage,
  log,
  loginThrottle,
  mfa,
}: AccountDeletionDeps) => {
  const remove = async (userId: Snowflake, { withOwnedGuilds }: { withOwnedGuilds: boolean }) => {
    if (await admin.isLastAdmin(userId)) {
      throw badRequest('LAST_ADMIN', 'The instance needs at least one active admin')
    }
    const owned = await db.select({ id: guilds.id }).from(guilds).where(eq(guilds.ownerId, userId))
    if (owned.length > 0 && !withOwnedGuilds) {
      throw badRequest('OWNS_GUILDS', 'Transfer or delete your servers first')
    }
    for (const guild of owned) await deleteGuild(guild.id)

    // The account and its bots, with what has to be announced once their rows are gone.
    const accounts = await db
      .select({ id: users.id, avatarId: users.avatarId, bannerId: users.bannerId })
      .from(users)
      .where(eq(users.botOwnerId, userId))
    const [self] = await db
      .select({ id: users.id, avatarId: users.avatarId, bannerId: users.bannerId })
      .from(users)
      .where(eq(users.id, userId))
    if (!self) throw unknownUser()
    const all = [...accounts, self]
    const memberships = await db
      .select({ guildId: guildMembers.guildId, userId: guildMembers.userId })
      .from(guildMembers)
      .where(
        inArray(
          guildMembers.userId,
          all.map((account) => account.id),
        ),
      )

    if (!(await admin.deleteUser(userId))) throw unknownUser()

    for (const account of all) {
      await publishRevokedSessions(events, account.id, { scope: 'all' })
    }
    for (const membership of memberships) {
      await events.publish({
        topic: guildTopic(membership.guildId),
        type: 'GUILD_MEMBER_REMOVE',
        data: membership,
      })
    }
    const avatars = all.flatMap((a) => [
      ...(a.avatarId ? [profileImageKey('avatars', a.id, a.avatarId)] : []),
      ...(a.bannerId ? [profileImageKey('banners', a.id, a.bannerId)] : []),
    ])
    if (storage && avatars.length > 0) {
      // Only costs space if it fails: nothing points at these objects any more.
      await storage.delete(avatars).catch((error: unknown) => {
        log?.warn({ err: error }, "Failed to delete a deleted account's avatars")
      })
    }
  }

  return {
    async deleteSelf(user: UserRow, password: string, code?: string): Promise<void> {
      if (!(await confirmPassword(loginThrottle, user, password))) {
        throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')
      }
      if (user.totpSecret) {
        if (!code) throw badRequest('MFA_CODE_REQUIRED', 'Enter a code from your authenticator')
        if (!mfa || !(await mfa.verify(user, code))) {
          throw badRequest('INVALID_MFA_CODE', 'The code is wrong or was already used')
        }
      }
      await remove(user.id, { withOwnedGuilds: false })
    },

    /** An admin removes someone else's account, servers included (spam, abuse). */
    async deleteByAdmin(actorId: Snowflake, userId: Snowflake): Promise<void> {
      if (actorId === userId) {
        throw badRequest('CANNOT_MODIFY_SELF', 'Delete your own account from your settings')
      }
      await remove(userId, { withOwnedGuilds: true })
    },
  }
}

export type AccountDeletion = ReturnType<typeof createAccountDeletion>
