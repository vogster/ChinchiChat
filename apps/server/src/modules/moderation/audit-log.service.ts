import { Permission, computeBasePermissions, has } from '@chinchi/shared'

import { toPublicUser } from '../users/user.mapper'

import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildViews } from '../guilds/guild-views'
import type { AuditLogRow } from './audit-log.repository'
import type { AuditLogRepository, NewAuditLogEntry } from './audit-log.repository'
import type { AuditLogEntry, Snowflake } from '@chinchi/shared'

export interface AuditLogServiceDeps {
  readonly entries: AuditLogRepository
  readonly access: Pick<GuildAccessChecks, 'requirePermission'>
  readonly views: Pick<GuildViews, 'channelIds'>
  readonly nextId: () => Snowflake
}

export type AuditRecord = Omit<NewAuditLogEntry, 'id'>

/** Writes down who changed what on a server; read with VIEW_AUDIT_LOG. */
/** The channel an entry is about, if any. */
const channelOf = (entry: AuditLogRow): string | null => {
  if (entry.action.startsWith('channel_')) return entry.targetId
  if (entry.action === 'message_delete' && typeof entry.data.channelId === 'string') {
    return entry.data.channelId
  }
  return null
}

export const createAuditLogService = ({ entries, access, views, nextId }: AuditLogServiceDeps) => ({
  async record(entry: AuditRecord): Promise<void> {
    await entries.insert({ ...entry, id: nextId() })
  },

  async list(
    guildId: Snowflake,
    viewerId: Snowflake,
    query: { before?: Snowflake | undefined; limit: number },
  ): Promise<AuditLogEntry[]> {
    const viewer = await access.requirePermission(guildId, viewerId, Permission.ViewAuditLog)
    const rows = await entries.page(guildId, query)
    const channels = await views.channelIds(viewer)
    // Deleted channels can't be checked any more: only those who manage channels see them.
    const managesChannels = has(computeBasePermissions(viewer.context), Permission.ManageChannels)
    const hidden = (channelId: string | null) =>
      channelId !== null &&
      (channels.existing.has(channelId) ? !channels.visible.has(channelId) : !managesChannels)
    return rows.map(({ entry, actor, target }) => {
      // Entries about channels the viewer can't see keep the action but lose the details.
      const redact = hidden(channelOf(entry))
      return {
        id: entry.id,
        action: entry.action,
        actor: actor ? toPublicUser(actor) : null,
        targetUser: target ? toPublicUser(target) : null,
        targetId: redact ? null : entry.targetId,
        reason: entry.reason,
        data: redact ? {} : entry.data,
        createdAt: entry.createdAt.toISOString(),
      }
    })
  },
})

export type AuditLogService = ReturnType<typeof createAuditLogService>
