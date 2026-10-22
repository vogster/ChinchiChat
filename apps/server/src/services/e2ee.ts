import { createApprovalService } from '../modules/e2ee/approval.service'
import { createMemoryApprovalStore, createRedisApprovalStore } from '../modules/e2ee/approval.store'
import { createBackupRepository } from '../modules/e2ee/backup.repository'
import { createBackupService } from '../modules/e2ee/backup.service'
import { createE2eeRepository } from '../modules/e2ee/e2ee.repository'
import { createE2eeService } from '../modules/e2ee/e2ee.service'

import type { Database } from '../db/client'
import type { EventBus } from '../events/event-bus'
import type { ChannelService } from '../modules/channels/channel.service'
import type { ChannelEvents } from '../modules/channels/channel-events'
import type { DmRepository } from '../modules/dms/dm.repository'
import type { GuildRepository } from '../modules/guilds/guild.repository'
import type { RelationshipRepository } from '../modules/relationships/relationship.repository'
import type { Snowflake } from '@chinchi/shared'
import type { Redis } from 'ioredis'

export interface E2eeServiceDeps {
  readonly db: Database
  readonly events: EventBus
  readonly redis: Redis | undefined
  readonly nextId: () => Snowflake
  readonly guilds: GuildRepository
  readonly relationships: RelationshipRepository
  readonly dms: DmRepository
  readonly channels: ChannelService
  readonly channelEvents: ChannelEvents
}

/** Encrypted conversations: devices and key packages, history backups, device approvals. */
export const createE2eeServices = ({
  db,
  events,
  redis,
  nextId,
  guilds,
  relationships,
  dms,
  channels,
  channelEvents,
}: E2eeServiceDeps) => {
  const e2eeRows = createE2eeRepository(db)
  return {
    e2ee: createE2eeService({
      e2ee: e2eeRows,
      guilds,
      relationships,
      dms,
      channels,
      channelEvents,
      events,
      nextId,
    }),
    backup: createBackupService({
      backups: createBackupRepository(db),
      userKeySetAt: async (userId) => (await e2eeRows.findUserKey(userId))?.createdAt ?? null,
      nextId,
    }),
    approval: createApprovalService({
      approvals: redis ? createRedisApprovalStore(redis) : createMemoryApprovalStore(),
      e2ee: e2eeRows,
      events,
      nextId,
    }),
  }
}
