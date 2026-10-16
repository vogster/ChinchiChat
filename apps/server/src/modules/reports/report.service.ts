import { Permission, has } from '@chinchi/shared'

import { HttpError, badRequest } from '../../http/http-error'
import { permissionsIn } from '../guilds/guild-access'
import { toPublicUser } from '../users/user.mapper'

import type { ChannelService } from '../channels/channel.service'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { MessageRepository } from '../messages/message.repository'
import type { OverwriteRepository } from '../roles/overwrite.repository'
import type { ChannelRepository } from '../channels/channel.repository'
import type { ReportRepository, ReportWithPeople } from './report.repository'
import type { Report, ReportReason, ReportStatus, Snowflake } from '@chinchi/shared'

export interface ReportServiceDeps {
  readonly reports: ReportRepository
  readonly channels: Pick<ChannelService, 'resolve'>
  readonly channelRows: Pick<ChannelRepository, 'listByGuild'>
  readonly overwrites: Pick<OverwriteRepository, 'listForChannels'>
  readonly messages: Pick<MessageRepository, 'findInChannel'>
  readonly access: Pick<GuildAccessChecks, 'requirePermission'>
  readonly nextId: () => Snowflake
}

interface ListQuery {
  readonly status: ReportStatus
  readonly before?: Snowflake | undefined
  readonly limit: number
}

const unknownReport = () => new HttpError(404, 'UNKNOWN_REPORT', 'Unknown report')

const toReport = ({ report, author, reporter, resolver }: ReportWithPeople): Report => ({
  id: report.id,
  guildId: report.guildId,
  channelId: report.channelId,
  messageId: report.messageId,
  author: author ? toPublicUser(author) : null,
  content: report.content,
  reporter: reporter ? toPublicUser(reporter) : null,
  reason: report.reason,
  details: report.details,
  status: report.status,
  resolvedBy: resolver ? toPublicUser(resolver) : null,
  createdAt: report.createdAt.toISOString(),
})

/** Reports of messages: server ones for its moderators, direct ones for instance admins. */
export const createReportService = ({
  reports,
  channels,
  channelRows,
  overwrites,
  messages,
  access,
  nextId,
}: ReportServiceDeps) => {
  /**
   * Channels where the moderator may handle reports: they see the channel and manage its
   * messages. Reports elsewhere (hidden channels) stay out of their list.
   */
  const moderatedChannels = async (guildId: Snowflake, userId: Snowflake) => {
    const moderator = await access.requirePermission(guildId, userId, Permission.ManageMessages)
    const rows = await channelRows.listByGuild(guildId)
    const byChannel = await overwrites.listForChannels(rows.map((row) => row.id))
    return rows
      .filter((row) => {
        const permissions = permissionsIn(moderator, byChannel.get(row.id) ?? [])
        return (
          has(permissions, Permission.ViewChannel) && has(permissions, Permission.ManageMessages)
        )
      })
      .map((row) => row.id)
  }

  return {
    async create(
      reporterId: Snowflake,
      channelId: Snowflake,
      messageId: Snowflake,
      { reason, details }: { reason: ReportReason; details?: string | undefined },
    ): Promise<void> {
      const { channel, permissions } = await channels.resolve(channelId, reporterId)
      if (!has(permissions, Permission.ReadMessageHistory)) {
        throw new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')
      }
      const found = await messages.findInChannel(channel.id, messageId)
      if (!found) throw new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')
      if (found.message.authorId === reporterId) {
        throw badRequest('CANNOT_REPORT_OWN', "You can't report your own message")
      }
      // Moderators would get an empty copy: the server can't read encrypted messages.
      if (found.message.ciphertext !== null) {
        throw badRequest(
          'ENCRYPTED_CHANNEL',
          "Messages of encrypted conversations can't be reported",
        )
      }
      await reports.insert({
        id: nextId(),
        guildId: channel.guildId,
        channelId: channel.id,
        messageId,
        authorId: found.message.authorId,
        content: found.message.content,
        reporterId,
        reason,
        details: details || null,
      })
    },

    async listForGuild(guildId: Snowflake, userId: Snowflake, query: ListQuery) {
      const channelIds = await moderatedChannels(guildId, userId)
      // A moderator's own messages are judged by the others (and the owner).
      return (await reports.list({ guildId, channelIds, notAbout: userId, ...query })).map(toReport)
    },

    async closeForGuild(
      guildId: Snowflake,
      userId: Snowflake,
      reportId: Snowflake,
      status: ReportStatus,
    ): Promise<Report> {
      const channelIds = await moderatedChannels(guildId, userId)
      const found = await reports.find(guildId, reportId)
      if (
        !found ||
        !channelIds.includes(found.report.channelId) ||
        found.report.authorId === userId
      ) {
        throw unknownReport()
      }
      await reports.setStatus(reportId, status, userId)
      return toReport((await reports.find(guildId, reportId)) as ReportWithPeople)
    },

    /** Direct-message reports; the caller has checked the user is an instance admin. */
    async listDirect(query: ListQuery) {
      return (await reports.list({ guildId: null, ...query })).map(toReport)
    },

    async closeDirect(adminId: Snowflake, reportId: Snowflake, status: ReportStatus) {
      if (!(await reports.find(null, reportId))) throw unknownReport()
      await reports.setStatus(reportId, status, adminId)
      return toReport((await reports.find(null, reportId)) as ReportWithPeople)
    },
  }
}

export type ReportService = ReturnType<typeof createReportService>
