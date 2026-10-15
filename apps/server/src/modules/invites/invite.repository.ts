import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { channels, guilds, invites, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { ChannelRow } from '../channels/channel.repository'
import type { GuildRow } from '../guilds/guild.repository'
import type { UserRow } from '../users/user.repository'
import type { Snowflake } from '@chinchi/shared'

export type InviteRow = typeof invites.$inferSelect

export interface InviteWithRelations {
  readonly invite: InviteRow
  readonly guild: GuildRow
  readonly channel: ChannelRow
  readonly inviter: UserRow | null
}

const inviter = alias(users, 'inviter')

/** Still usable: not expired and not used up. */
const isActive = (now: Date) =>
  and(
    or(isNull(invites.expiresAt), gt(invites.expiresAt, now)),
    or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)),
  )

export const createInviteRepository = (db: DbExecutor) => {
  const selectWithRelations = () =>
    db
      .select({ invite: invites, guild: guilds, channel: channels, inviter })
      .from(invites)
      .innerJoin(guilds, eq(guilds.id, invites.guildId))
      .innerJoin(channels, eq(channels.id, invites.channelId))
      .leftJoin(inviter, eq(inviter.id, invites.inviterId))

  return {
    async insert(
      invite: Pick<
        InviteRow,
        'code' | 'guildId' | 'channelId' | 'inviterId' | 'maxUses' | 'expiresAt'
      >,
    ): Promise<InviteRow> {
      const [row] = await db.insert(invites).values(invite).returning()
      return row as InviteRow
    },

    async findActive(code: string, now: Date): Promise<InviteWithRelations | null> {
      const [row] = await selectWithRelations()
        .where(and(eq(invites.code, code), isActive(now)))
        .limit(1)
      return (row as InviteWithRelations | undefined) ?? null
    },

    async findWithRelations(code: string): Promise<InviteWithRelations | null> {
      const [row] = await selectWithRelations().where(eq(invites.code, code)).limit(1)
      return (row as InviteWithRelations | undefined) ?? null
    },

    async listForGuild(guildId: Snowflake): Promise<InviteWithRelations[]> {
      // Invites only ever point to server channels.
      return (await selectWithRelations()
        .where(eq(invites.guildId, guildId))
        .orderBy(desc(invites.createdAt))) as InviteWithRelations[]
    },

    /**
     * Takes one use if the invite is still active. A single conditional UPDATE means concurrent
     * joins can never exceed `max_uses`.
     */
    async consume(code: string, now: Date): Promise<boolean> {
      const updated = await db
        .update(invites)
        .set({ uses: sql`${invites.uses} + 1` })
        .where(and(eq(invites.code, code), isActive(now)))
        .returning({ code: invites.code })
      return updated.length > 0
    },

    async delete(code: string): Promise<void> {
      await db.delete(invites).where(eq(invites.code, code))
    },
  }
}

export type InviteRepository = ReturnType<typeof createInviteRepository>
