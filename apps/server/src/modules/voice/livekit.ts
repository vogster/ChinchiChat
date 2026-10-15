import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

import type { VoiceConfig } from '../../config/env'

/** What a participant may send: LiveKit's own source names. */
export type PublishSource = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio'

export interface ParticipantPermissions {
  readonly sources: readonly PublishSource[]
  readonly canSubscribe: boolean
}

/** The part of LiveKit's room API the server uses; faked in tests. */
export interface VoiceRooms {
  /** Disconnects someone; a participant who is already gone is not an error. */
  removeParticipant(room: string, identity: string): Promise<void>
  /** Changes a connected participant's rights at once (server mute and deafen). */
  setPermissions(room: string, identity: string, permissions: ParticipantPermissions): Promise<void>
  /** Who is connected right now (an unknown room has nobody). */
  listParticipants(room: string): Promise<readonly { identity: string; sid: string }[]>
}

const SOURCE_TO_TRACK: Readonly<Record<PublishSource, TrackSource>> = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
}

const isNotFound = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404

export const createLiveKitRooms = (config: VoiceConfig): VoiceRooms => {
  const client = new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret)
  return {
    async removeParticipant(room, identity) {
      try {
        await client.removeParticipant(room, identity)
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },
    async listParticipants(room) {
      try {
        const participants = await client.listParticipants(room)
        return participants.map(({ identity, sid }) => ({ identity, sid }))
      } catch (error) {
        if (isNotFound(error)) return []
        throw error
      }
    },
    async setPermissions(room, identity, { sources, canSubscribe }) {
      try {
        await client.updateParticipant(room, identity, {
          permission: {
            canPublish: sources.length > 0,
            canPublishSources: sources.map((source) => SOURCE_TO_TRACK[source]),
            canSubscribe,
            canPublishData: false,
          },
        })
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    },
  }
}

/** Long enough to connect; LiveKit refreshes the token of a connected participant itself. */
export const VOICE_TOKEN_TTL_S = 600

export const issueVoiceToken = (
  config: VoiceConfig,
  {
    room,
    identity,
    name,
    permissions,
  }: {
    room: string
    identity: string
    name: string
    permissions: ParticipantPermissions
  },
): Promise<string> => {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    ttl: VOICE_TOKEN_TTL_S,
  })
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: permissions.sources.length > 0,
    canPublishSources: permissions.sources.map((source) => SOURCE_TO_TRACK[source]),
    canSubscribe: permissions.canSubscribe,
    // Chat goes through the API, never around it.
    canPublishData: false,
  })
  return token.toJwt()
}

/** A server voice channel's room, or a DM call's (`guildId: null`). */
export const voiceRoom = (channelId: string, guildId: string | null = 'guild') =>
  guildId === null ? `dm:${channelId}` : `voice:${channelId}`

/** The channel a room belongs to, or null for rooms the server does not own. */
export const channelOfRoom = (room: string): string | null => {
  const match = /^(?:voice|dm):(\d{1,20})$/.exec(room)
  return match ? (match[1] as string) : null
}
