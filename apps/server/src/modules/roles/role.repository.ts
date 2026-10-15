import { and, asc, eq, max, sql } from 'drizzle-orm'

import { memberRoles, roles } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { Snowflake } from '@chinchi/shared'

export type RoleRow = typeof roles.$inferSelect
export type NewRole = Pick<
  RoleRow,
  'id' | 'guildId' | 'name' | 'color' | 'position' | 'permissions' | 'hoist' | 'mentionable'
>

export const createRoleRepository = (db: DbExecutor) => ({
  async insert(role: NewRole): Promise<RoleRow> {
    const [row] = await db.insert(roles).values(role).returning()
    return row as RoleRow
  },

  /** Highest position first, like the role list in settings. */
  async listByGuild(guildId: Snowflake): Promise<RoleRow[]> {
    return db
      .select()
      .from(roles)
      .where(eq(roles.guildId, guildId))
      .orderBy(sql`${roles.position} desc`, asc(roles.id))
  },

  async findInGuild(guildId: Snowflake, roleId: Snowflake): Promise<RoleRow | null> {
    const [row] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.guildId, guildId), eq(roles.id, roleId)))
      .limit(1)
    return row ?? null
  },

  async maxPosition(guildId: Snowflake): Promise<number> {
    const [row] = await db
      .select({ value: max(roles.position) })
      .from(roles)
      .where(eq(roles.guildId, guildId))
    return row?.value ?? 0
  },

  async update(
    roleId: Snowflake,
    changes: Partial<Omit<NewRole, 'id' | 'guildId'>>,
  ): Promise<RoleRow> {
    const [row] = await db.update(roles).set(changes).where(eq(roles.id, roleId)).returning()
    return row as RoleRow
  },

  async delete(roleId: Snowflake): Promise<void> {
    await db.delete(roles).where(eq(roles.id, roleId))
  },

  async memberRoleIds(guildId: Snowflake, userId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(and(eq(memberRoles.guildId, guildId), eq(memberRoles.userId, userId)))
    return rows.map((row) => row.roleId)
  },

  /** userId → role ids, for listing members. */
  async memberRoleIdsByUser(guildId: Snowflake): Promise<Map<Snowflake, Snowflake[]>> {
    const rows = await db.select().from(memberRoles).where(eq(memberRoles.guildId, guildId))
    const byUser = new Map<Snowflake, Snowflake[]>()
    for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.roleId])
    return byUser
  },

  async addMemberRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): Promise<void> {
    await db.insert(memberRoles).values({ guildId, userId, roleId }).onConflictDoNothing()
  },

  async removeMemberRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): Promise<void> {
    await db
      .delete(memberRoles)
      .where(
        and(
          eq(memberRoles.guildId, guildId),
          eq(memberRoles.userId, userId),
          eq(memberRoles.roleId, roleId),
        ),
      )
  },

  /** Members holding a role (to tell them their roles changed when it is deleted). */
  async holders(roleId: Snowflake): Promise<Snowflake[]> {
    const rows = await db
      .select({ userId: memberRoles.userId })
      .from(memberRoles)
      .where(eq(memberRoles.roleId, roleId))
    return rows.map((row) => row.userId)
  },

  async setPositions(
    guildId: Snowflake,
    positions: readonly { id: Snowflake; position: number }[],
  ): Promise<void> {
    for (const { id, position } of positions) {
      await db
        .update(roles)
        .set({ position })
        .where(and(eq(roles.guildId, guildId), eq(roles.id, id)))
    }
  },
})

export type RoleRepository = ReturnType<typeof createRoleRepository>
