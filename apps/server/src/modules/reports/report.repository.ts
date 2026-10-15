import { aliasedTable, and, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm'

import { messageReports, users } from '../../db/schema'

import type { DbExecutor } from '../../db/client'
import type { UserRow } from '../users/user.repository'
import type { ReportStatus, Snowflake } from '@chinchi/shared'

export type ReportRow = typeof messageReports.$inferSelect

export interface ReportWithPeople {
  readonly report: ReportRow
  readonly author: UserRow | null
  readonly reporter: UserRow | null
  readonly resolver: UserRow | null
}

interface ListOptions {
  /** A server's reports, or (null) those about direct messages. */
  readonly guildId: Snowflake | null
  /** Only these channels (the ones the moderator can see); omit for all. */
  readonly channelIds?: readonly Snowflake[]
  readonly status: ReportStatus
  readonly before?: Snowflake | undefined
  readonly limit: number
  /** Leaves out reports about this person's own messages. */
  readonly notAbout?: Snowflake
}

export const createReportRepository = (db: DbExecutor) => {
  const authors = aliasedTable(users, 'report_authors')
  const reporters = aliasedTable(users, 'report_reporters')
  const resolvers = aliasedTable(users, 'report_resolvers')
  const withPeople = () =>
    db
      .select({ report: messageReports, author: authors, reporter: reporters, resolver: resolvers })
      .from(messageReports)
      .leftJoin(authors, eq(authors.id, messageReports.authorId))
      .leftJoin(reporters, eq(reporters.id, messageReports.reporterId))
      .leftJoin(resolvers, eq(resolvers.id, messageReports.resolvedBy))

  const inScope = (guildId: Snowflake | null) =>
    guildId === null ? isNull(messageReports.guildId) : eq(messageReports.guildId, guildId)

  return {
    /** One report per person per message: reporting again changes nothing. */
    async insert(report: typeof messageReports.$inferInsert): Promise<void> {
      await db.insert(messageReports).values(report).onConflictDoNothing()
    },

    async list({ guildId, channelIds, status, before, limit, notAbout }: ListOptions) {
      if (channelIds?.length === 0) return []
      return withPeople()
        .where(
          and(
            inScope(guildId),
            eq(messageReports.status, status),
            channelIds ? inArray(messageReports.channelId, [...channelIds]) : undefined,
            before ? lt(messageReports.id, before) : undefined,
            notAbout
              ? or(isNull(messageReports.authorId), ne(messageReports.authorId, notAbout))
              : undefined,
          ),
        )
        .orderBy(desc(messageReports.id))
        .limit(limit) as Promise<ReportWithPeople[]>
    },

    async find(guildId: Snowflake | null, id: Snowflake): Promise<ReportWithPeople | null> {
      const [row] = await withPeople().where(and(inScope(guildId), eq(messageReports.id, id)))
      return (row as ReportWithPeople | undefined) ?? null
    },

    async setStatus(id: Snowflake, status: ReportStatus, resolvedBy: Snowflake): Promise<void> {
      await db.update(messageReports).set({ status, resolvedBy }).where(eq(messageReports.id, id))
    },
  }
}

export type ReportRepository = ReturnType<typeof createReportRepository>
