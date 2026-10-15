import { vi } from 'vitest'

import type { VoicePreferences } from '../features/voice/voice-preferences'
import type { VideoTile, VoiceRoomEvents, VoiceRoomFactory } from '../features/voice/voice-room'

/** LiveKit stand-in: records what the app asks for; tests push room events through it. */
export const createFakeVoice = () => {
  let events: VoiceRoomEvents | null = null
  const room = {
    connect: vi.fn(
      async (
        _url: string,
        _token: string,
        options: { microphone: boolean; preferences: VoicePreferences },
      ) => ({ microphone: options.microphone }),
    ),
    disconnect: vi.fn(async () => {}),
    setMicrophone: vi.fn(async (_enabled: boolean) => {}),
    setCamera: vi.fn(async (_enabled: boolean) => {}),
    setScreenShare: vi.fn(async (_enabled: boolean) => {}),
    setDeafened: vi.fn((_deafened: boolean) => {}),
    setPreferences: vi.fn(async (_preferences: VoicePreferences) => {}),
  }
  const factory: VoiceRoomFactory = (next) => {
    events = next
    return room
  }
  return {
    factory,
    room,
    speaking: (userIds: string[]) => events?.onSpeakingChange(userIds),
    video: (tiles: VideoTile[]) => events?.onVideoChange(tiles),
    /** The server or network ended the connection. */
    drop: () => events?.onDisconnected(),
  }
}

export type FakeVoice = ReturnType<typeof createFakeVoice>
