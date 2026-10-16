import type { DmService } from '../modules/dms/dm.service'
import type { GuildRepository } from '../modules/guilds/guild.repository'
import type { GuildAccessChecks } from '../modules/guilds/guild-access'
import type { GuildViews } from '../modules/guilds/guild-views'
import type { MentionCounter } from '../modules/messages/mention-counter'
import type { ReadStateRepository } from '../modules/messages/read-state.repository'
import type { NotificationRepository } from '../modules/notifications/notification.repository'
import type { VoiceService } from '../modules/voice/voice.service'
import type { PresenceService } from './presence'
import type {
  CustomStatus,
  GuildDetail,
  MentionCounts,
  NotificationSetting,
  Presence,
  PrivateChannel,
  ReadState,
  VoiceState,
} from '@chinchi/shared'

export interface SnapshotDeps {
  readonly guilds: GuildRepository
  readonly access: GuildAccessChecks
  readonly views: GuildViews
  readonly presence: PresenceService
  readonly readStates: ReadStateRepository
  readonly notificationSettings: Pick<NotificationRepository, 'listForUser'>
  readonly mentionCounter: MentionCounter
  readonly dms: Pick<DmService, 'list'>
  readonly friendIdsFor: (userId: string) => Promise<readonly string[]>
  readonly voice: Pick<VoiceService, 'statesIn' | 'statesInDms'>
}

/** Everything a client needs to render after connecting, limited to what the user may see. */
export const createSnapshot =
  ({
    guilds,
    access,
    views,
    presence,
    readStates,
    notificationSettings,
    mentionCounter,
    dms,
    friendIdsFor,
    voice,
  }: SnapshotDeps) =>
  async (
    userId: string,
  ): Promise<{
    guilds: GuildDetail[]
    privateChannels: PrivateChannel[]
    voiceStates: VoiceState[]
    presences: Presence[]
    customStatus: CustomStatus | null
    readStates: ReadState[]
    notificationSettings: NotificationSetting[]
    mentionCounts: MentionCounts
  }> => {
    const rows = await guilds.listForUser(userId)
    const details = await Promise.all(
      rows.map(async (guild) => views.detail(await access.requireMember(guild.id, userId))),
    )
    const privateChannels = await dms.list(userId)
    const [memberIds, friendIds] = await Promise.all([
      guilds.listMemberIdsOf(rows.map((guild) => guild.id)),
      friendIdsFor(userId),
    ])
    return {
      guilds: details,
      privateChannels,
      voiceStates: [
        ...(
          await Promise.all(
            details.map((guild) =>
              voice.statesIn(guild.id, new Set(guild.channels.map((channel) => channel.id))),
            ),
          )
        ).flat(),
        ...(await voice.statesInDms(privateChannels.map((channel) => channel.id))),
      ],
      // Include the user's own status even before they share a server with anyone.
      presences: await presence.visible([...new Set([...memberIds, ...friendIds, userId])]),
      customStatus: await presence.custom(userId),
      readStates: await readStates.listForUser(userId),
      notificationSettings: await notificationSettings.listForUser(userId),
      mentionCounts: await mentionCounter.fromDetails(
        userId,
        details,
        privateChannels.map((channel) => channel.id),
      ),
    }
  }
