import { createHash } from 'node:crypto'

import { AccessToken, TokenVerifier } from 'livekit-server-sdk'

import type { VoiceRooms } from '../src/modules/voice/livekit'

/** LiveKit settings for tests; nothing listens there, the room API is faked. */
export const VOICE_ENV = {
  LIVEKIT_URL: 'ws://livekit.test:7880',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-livekit-secret-of-32-characters!',
} as const

/** Records what the server asked LiveKit to do. */
export const createFakeRooms = () => {
  const calls: { method: string; room: string; identity: string; args?: unknown }[] = []
  /** room → who LiveKit reports as connected (for reconciling). */
  const participants = new Map<string, { identity: string; sid: string }[]>()
  const rooms: VoiceRooms = {
    async listParticipants(room) {
      return participants.get(room) ?? []
    },
    async removeParticipant(room, identity) {
      calls.push({ method: 'removeParticipant', room, identity })
    },
    async setPermissions(room, identity, permissions) {
      calls.push({ method: 'setPermissions', room, identity, args: permissions })
    },
  }
  return {
    rooms,
    calls,
    participants,
    /** What the server asked for, of one kind. */
    callsOf: (method: string) => calls.filter((call) => call.method === method),
    clear: () => {
      calls.splice(0)
      participants.clear()
    },
  }
}

export const readVoiceToken = (token: string) =>
  new TokenVerifier(VOICE_ENV.LIVEKIT_API_KEY, VOICE_ENV.LIVEKIT_API_SECRET).verify(token)

/** A webhook request exactly as LiveKit signs it: a JWT carrying the body's SHA-256. */
export const signedWebhook = async (event: Record<string, unknown>) => {
  const body = JSON.stringify({ id: `EV_${Math.random()}`, createdAt: '1', ...event })
  const token = new AccessToken(VOICE_ENV.LIVEKIT_API_KEY, VOICE_ENV.LIVEKIT_API_SECRET)
  token.sha256 = createHash('sha256').update(body).digest('base64')
  return {
    body,
    headers: { authorization: await token.toJwt(), 'content-type': 'application/webhook+json' },
  }
}
