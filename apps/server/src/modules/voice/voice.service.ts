import { Permission, has } from '@chinchi/shared'
import { TrackSource } from 'livekit-server-sdk'

import { guildTopic, userTopic } from '../../events/event-bus'
import { HttpError, badRequest, forbidden } from '../../http/http-error'
import { isGuildChannel } from '../channels/channel.repository'
import { outranks } from '../guilds/outranks'
import { channelOfRoom, issueVoiceToken, voiceRoom } from './livekit'
import { createVoiceMove } from './voice-move'

import type { VoiceConfig } from '../../config/env'
import type { EventBus } from '../../events/event-bus'
import type { ChannelRepository, ChannelRow } from '../channels/channel.repository'
import type { ChannelService } from '../channels/channel.service'
import type { GuildAccessChecks } from '../guilds/guild-access'
import type { GuildRepository } from '../guilds/guild.repository'
import type { UserRow } from '../users/user.repository'
import type { ParticipantPermissions, PublishSource, VoiceRooms } from './livekit'
import type { VoiceEntry, VoiceStateStore } from './voice-state.store'
import type {
  JoinVoiceRequest,
  MemberVoiceRequest,
  Snowflake,
  UpdateVoiceStateRequest,
  VoiceConnection,
  VoiceState,
} from '@chinchi/shared'
import type { WebhookEvent } from 'livekit-server-sdk'

export interface VoiceServiceDeps {
  readonly config: VoiceConfig | undefined
  readonly rooms: VoiceRooms | undefined
  /** Valkey; without it voice stays off. */
  readonly store: VoiceStateStore | undefined
  readonly channels: Pick<ChannelService, 'resolve'>
  readonly channelRows: Pick<ChannelRepository, 'findById'>
  readonly access: GuildAccessChecks
  readonly guilds: Pick<GuildRepository, 'setVoiceFlags'>
  readonly events: EventBus
  /** Members of a DM, who hear about its call. */
  readonly recipientIds: (channelId: Snowflake) => Promise<Snowflake[]>
}

const voiceDisabled = () => badRequest('VOICE_DISABLED', 'Voice is not set up on this instance')
const notInVoice = () => badRequest('NOT_IN_VOICE', 'You are not connected to voice')
const hierarchy = () =>
  forbidden('ROLE_HIERARCHY', 'You can only moderate members below your highest role')

/** What a member may send in a voice channel with these permissions. */
export const publishRights = (
  permissions: bigint,
  { serverMute, serverDeaf }: { serverMute: boolean; serverDeaf: boolean },
): ParticipantPermissions => {
  const sources: PublishSource[] = []
  if (has(permissions, Permission.Speak) && !serverMute) sources.push('microphone')
  if (has(permissions, Permission.Video)) {
    sources.push('camera', 'screen_share', 'screen_share_audio')
  }
  return { sources, canSubscribe: !serverDeaf }
}

const TRACK_FLAGS: Partial<Record<TrackSource, 'video' | 'stream'>> = {
  [TrackSource.CAMERA]: 'video',
  [TrackSource.SCREEN_SHARE]: 'stream',
}

export const createVoiceService = ({
  config,
  rooms,
  store,
  channels,
  channelRows,
  access,
  guilds,
  events,
  recipientIds,
}: VoiceServiceDeps) => {
  const requireVoice = () => {
    if (!config || !rooms || !store) throw voiceDisabled()
    return { config, rooms, store }
  }

  /**
   * Tells who may see it: a server channel's state goes to the server (the gateway filters by
   * visibility), a DM call's to each member of the DM. `channelId` is the call's channel, which a
   * leave event no longer carries.
   */
  const announce = async (state: VoiceState, channelId: Snowflake) => {
    const publish = (topic: string) =>
      events.publish({ topic, type: 'VOICE_STATE_UPDATE', data: state })
    if (state.guildId) return publish(guildTopic(state.guildId))
    await Promise.all((await recipientIds(channelId)).map((id) => publish(userTopic(id))))
  }

  /** The user's rights in a server voice channel, or null if they may not be there. */
  const rightsIn = async (channel: ChannelRow, userId: Snowflake) => {
    try {
      const { access: member, permissions } = await access.requireChannel(
        channel,
        userId,
        Permission.Connect,
      )
      const flags = { serverMute: member.member.voiceMute, serverDeaf: member.member.voiceDeaf }
      return { flags, rights: publishRights(permissions, flags) }
    } catch (error) {
      if (error instanceof HttpError) return null
      throw error
    }
  }

  /** Where the user may be in voice and with what, or null: a server voice channel or a DM. */
  const admission = async (channelId: Snowflake, userId: Snowflake) => {
    const channel = await channelRows.findById(channelId)
    if (!channel) return null
    if (isGuildChannel(channel)) {
      if (channel.type !== 'voice') return null
      const allowed = await rightsIn(channel, userId)
      return allowed ? { guildId: channel.guildId, ...allowed } : null
    }
    try {
      const { permissions } = await channels.resolve(channel.id, userId, Permission.Connect)
      const flags = { serverMute: false, serverDeaf: false }
      return { guildId: null, flags, rights: publishRights(permissions, flags) }
    } catch (error) {
      if (error instanceof HttpError) return null
      throw error
    }
  }

  const roomOf = (state: VoiceState) => voiceRoom(state.channelId ?? '', state.guildId)

  /** Ends a connection we know about and tells its audience (when it was the current one). */
  const endConnection = async ({ state, sid }: VoiceEntry) => {
    if (!state.channelId) return
    if (await requireVoice().store.remove(state.userId, sid)) {
      await announce({ ...state, channelId: null }, state.channelId)
    }
  }

  const onJoined = async (room: string, channelId: Snowflake, userId: Snowflake, sid: string) => {
    const voice = requireVoice()
    const allowed = await admission(channelId, userId)
    // A DM's id never names a server room (or the reverse): someone forged the room name.
    if (!allowed || room !== voiceRoom(channelId, allowed.guildId)) {
      // Rights were taken away (or the channel went) while the client was connecting.
      await voice.rooms.removeParticipant(room, userId)
      return
    }
    const [intent, previous] = await Promise.all([
      voice.store.takeIntent(userId, channelId),
      voice.store.getEntry(userId),
    ])
    // A reconnect to the same channel keeps the user's choice; a fresh join uses what they asked.
    const kept = previous?.state.channelId === channelId ? previous.state : null
    const state: VoiceState = {
      guildId: allowed.guildId,
      channelId,
      userId,
      selfMute: intent?.selfMute ?? kept?.selfMute ?? false,
      selfDeaf: intent?.selfDeaf ?? kept?.selfDeaf ?? false,
      ...allowed.flags,
      video: false,
      stream: false,
    }
    // The connection already left (its webhook overtook this one): nothing to record.
    if (!(await voice.store.put({ state, sid }))) return
    // The token was cut before any change made while connecting: apply the current rights.
    await voice.rooms.setPermissions(room, userId, allowed.rights)
    await announce(state, channelId)
    // Moving between servers or DMs: the old audience sees the user leave.
    const old = previous?.state
    if (old?.channelId && old.channelId !== channelId && old.guildId !== allowed.guildId) {
      await announce({ ...old, channelId: null }, old.channelId)
    }
  }

  const onLeft = async (userId: Snowflake, sid: string) => {
    const voice = requireVoice()
    const current = await voice.store.getEntry(userId)
    // Removing also records the connection as gone, so a late "joined" can't bring it back.
    const removed = await voice.store.remove(userId, sid)
    if (removed && current?.state.channelId) {
      await announce({ ...current.state, channelId: null }, current.state.channelId)
    }
  }

  const onTrack = async (
    event: WebhookEvent,
    channelId: Snowflake,
    userId: Snowflake,
    sid: string,
  ) => {
    const flag = event.track ? TRACK_FLAGS[event.track.source] : undefined
    if (!flag) return
    const state = await requireVoice().store.patchConnection(userId, sid, {
      [flag]: event.event === 'track_published',
    })
    if (state) await announce(state, channelId)
  }

  /** The room emptied (closed, or LiveKit restarted): nobody is in it any more. */
  const onRoomFinished = async (channelId: Snowflake) => {
    const voice = requireVoice()
    const entries = (await voice.store.listAll()).filter((e) => e.state.channelId === channelId)
    await Promise.all(entries.map(endConnection))
  }

  /** Re-checks a connected user's rights: drops them if they lost access, else updates them. */
  const revalidate = async (userId: Snowflake) => {
    if (!rooms || !store) return
    const entry = await store.getEntry(userId)
    if (!entry?.state.channelId) return
    const room = roomOf(entry.state)
    const allowed = await admission(entry.state.channelId, userId)
    if (!allowed) {
      await rooms.removeParticipant(room, userId)
      return
    }
    await rooms.setPermissions(room, userId, allowed.rights)
  }

  return {
    enabled: config !== undefined && rooms !== undefined && store !== undefined,

    /** A token for the channel's room, carrying only what the member may publish. */
    async join(
      user: UserRow,
      channelId: Snowflake,
      { selfMute = false, selfDeaf = false }: JoinVoiceRequest,
    ): Promise<VoiceConnection> {
      const voice = requireVoice()
      const {
        channel,
        permissions,
        access: member,
      } = await channels.resolve(channelId, user.id, Permission.Connect)
      const guildId = isGuildChannel(channel) ? channel.guildId : null
      if (guildId !== null && channel.type !== 'voice') {
        throw badRequest('INVALID_CHANNEL', 'Only voice channels can be joined')
      }
      const flags = member
        ? { serverMute: member.member.voiceMute, serverDeaf: member.member.voiceDeaf }
        : { serverMute: false, serverDeaf: false }
      // One voice connection per user: joining elsewhere ends the previous one first.
      const current = await voice.store.get(user.id)
      if (current?.channelId && current.channelId !== channel.id) {
        await voice.rooms.removeParticipant(roomOf(current), user.id)
      }
      const token = await issueVoiceToken(voice.config, {
        room: voiceRoom(channel.id, guildId),
        identity: user.id,
        name: user.displayName ?? user.username,
        permissions: publishRights(permissions, flags),
      })
      await voice.store.setIntent(user.id, { channelId: channel.id, selfMute, selfDeaf })
      return { url: voice.config.url, token }
    },

    /** Applies what LiveKit reports; events about rooms the server doesn't own are ignored. */
    async handleWebhook(event: WebhookEvent): Promise<void> {
      const voice = requireVoice()
      // Each delivery once: a replayed "left" must not hide someone who is still there.
      if (event.id && !(await voice.store.firstDelivery(event.id))) return
      const room = event.room?.name ?? ''
      const channelId = channelOfRoom(room)
      if (!channelId) return
      if (event.event === 'room_finished') return onRoomFinished(channelId)
      const userId = event.participant?.identity
      const sid = event.participant?.sid
      if (!userId || !sid || !/^\d{1,20}$/.test(userId)) return
      switch (event.event) {
        case 'participant_joined':
          return onJoined(room, channelId, userId, sid)
        case 'participant_left':
        case 'participant_connection_aborted':
          return onLeft(userId, sid)
        case 'track_published':
        case 'track_unpublished':
          return onTrack(event, channelId, userId, sid)
      }
    },

    async updateSelf(userId: Snowflake, changes: UpdateVoiceStateRequest): Promise<void> {
      const voice = requireVoice()
      const current = await voice.store.get(userId)
      if (!current?.channelId) throw notInVoice()
      const state = await voice.store.patchIfIn(userId, current.channelId, changes)
      if (!state) throw notInVoice()
      await announce(state, current.channelId)
    },

    /** Server mute, server deafen and disconnect, by members allowed to (and ranked above). */
    async moderate(
      actorId: Snowflake,
      guildId: Snowflake,
      targetId: Snowflake,
      { mute, deaf, disconnect }: MemberVoiceRequest,
    ): Promise<void> {
      const voice = requireVoice()
      const current = await voice.store.get(targetId)
      const here = current?.guildId === guildId ? current.channelId : null
      const found = here ? await channelRows.findById(here) : null
      const channel = found && isGuildChannel(found) ? found : null

      // Rights count where the target sits, so a channel can grant or deny moderation.
      const need = async (flag: bigint) => {
        if (!channel) return access.requirePermission(guildId, actorId, flag)
        // A channel hidden from the actor answers like a missing right: a 404 would reveal
        // that the target sits somewhere the actor can't see.
        await access.requireChannel(channel, actorId, flag).catch((error: unknown) => {
          if (error instanceof HttpError && error.statusCode === 404) {
            throw forbidden('MISSING_PERMISSIONS', 'Missing permissions')
          }
          throw error
        })
      }
      if (mute !== undefined) await need(Permission.MuteMembers)
      if (deaf !== undefined) await need(Permission.DeafenMembers)
      if (disconnect) await need(Permission.MoveMembers)
      if (actorId !== targetId) {
        const [actor, target] = await Promise.all([
          access.requireMember(guildId, actorId),
          access.requireMember(guildId, targetId).catch(() => {
            throw new HttpError(404, 'UNKNOWN_MEMBER', 'Unknown member')
          }),
        ])
        if (!outranks(actor, target)) throw hierarchy()
      }

      if (mute !== undefined || deaf !== undefined) {
        const member = await guilds.setVoiceFlags(guildId, targetId, {
          voiceMute: mute,
          voiceDeaf: deaf,
        })
        if (!member) throw new HttpError(404, 'UNKNOWN_MEMBER', 'Unknown member')
        const allowed = channel ? await rightsIn(channel, targetId) : null
        if (channel && allowed) {
          const room = voiceRoom(channel.id)
          try {
            await voice.rooms.setPermissions(room, targetId, allowed.rights)
          } catch {
            // The live connection can't be adjusted: end it, the next join carries the new rights.
            await voice.rooms.removeParticipant(room, targetId)
          }
          const state = await voice.store.patchIfIn(targetId, channel.id, allowed.flags)
          if (state) await announce(state, channel.id)
        }
      }
      if (disconnect && here) await voice.rooms.removeParticipant(voiceRoom(here), targetId)
    },

    /** Sends someone to another voice channel of the server. */
    move: createVoiceMove({ store: () => requireVoice().store, channelRows, access, events }),

    revalidate,

    /** Drops the user from any call, whatever their rights (all their sessions ended). */
    async disconnectUser(userId: Snowflake): Promise<void> {
      if (!rooms || !store) return
      const entry = await store.getEntry(userId)
      if (entry?.state.channelId) await rooms.removeParticipant(roomOf(entry.state), userId)
    },

    /** Re-checks everyone in voice on a server (roles, overwrites or channels changed). */
    async revalidateGuild(guildId: Snowflake): Promise<void> {
      if (!store) return
      const entries = await store.listForGuild(guildId)
      await Promise.all(entries.map((entry) => revalidate(entry.state.userId)))
    },

    /** Re-checks everyone in a DM's call (a block or a membership change). */
    async revalidateDm(channelId: Snowflake): Promise<void> {
      if (!store) return
      const entries = await store.listForDm(channelId)
      await Promise.all(entries.map((entry) => revalidate(entry.state.userId)))
    },

    /** Disconnects everyone in a channel that is going away; their leave webhooks clean up. */
    async disconnectChannel(channelId: Snowflake, guildId: Snowflake): Promise<void> {
      if (!rooms || !store) return
      const inside = (await store.listForGuild(guildId)).filter(
        (entry) => entry.state.channelId === channelId,
      )
      await Promise.all(
        inside.map((entry) => rooms.removeParticipant(voiceRoom(channelId), entry.state.userId)),
      )
    },

    /**
     * Drops recorded connections LiveKit no longer has (webhooks lost while this server was down,
     * LiveKit restarted). Runs at start and every minute.
     */
    async reconcile(): Promise<void> {
      if (!rooms || !store) return
      const entries = await store.listAll()
      const byRoom = new Map<string, VoiceEntry[]>()
      for (const entry of entries) {
        const room = roomOf(entry.state)
        byRoom.set(room, [...(byRoom.get(room) ?? []), entry])
      }
      for (const [room, inRoom] of byRoom) {
        const present = new Set((await rooms.listParticipants(room)).map((p) => p.sid))
        await Promise.all(inRoom.filter((entry) => !present.has(entry.sid)).map(endConnection))
      }
    },

    /** Who is in the calls of these DMs. */
    async statesInDms(channelIds: readonly Snowflake[]): Promise<VoiceState[]> {
      if (!store) return []
      const lists = await Promise.all(channelIds.map((id) => store.listForDm(id)))
      return lists.flat().map((entry) => entry.state)
    },

    /** Voice states in the given channels (the ones a user can see on a server). */
    async statesIn(guildId: Snowflake, channelIds: ReadonlySet<Snowflake>): Promise<VoiceState[]> {
      if (!store) return []
      const entries = await store.listForGuild(guildId)
      return entries
        .map((entry) => entry.state)
        .filter((state) => state.channelId !== null && channelIds.has(state.channelId))
    },
  }
}

export type VoiceService = ReturnType<typeof createVoiceService>
