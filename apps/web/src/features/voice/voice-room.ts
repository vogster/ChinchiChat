import { Room, RoomEvent, Track } from 'livekit-client'

import type { VoicePreferences } from './voice-preferences'
import type { AudioCaptureOptions, RemoteTrack } from 'livekit-client'

/** A video stream to show: someone's camera or shared screen. */
export interface VideoTile {
  readonly key: string
  readonly userId: string
  readonly source: 'camera' | 'screen'
  readonly attach: (element: HTMLVideoElement) => void
  readonly detach: (element: HTMLVideoElement) => void
}

export interface VoiceRoomEvents {
  /** Who is speaking right now (user ids, the local user included). */
  readonly onSpeakingChange: (userIds: readonly string[]) => void
  /** The connection ended without being asked to: kicked, network gone, room closed. */
  readonly onDisconnected: () => void
  /** Video tiles appeared or went away. */
  readonly onVideoChange: (tiles: readonly VideoTile[]) => void
}

/** The voice connection as the app sees it; tests replace it with a fake. */
export interface VoiceRoom {
  /** Resolves with whether the microphone really came on (the user may refuse access). */
  connect(
    url: string,
    token: string,
    options: { readonly microphone: boolean; readonly preferences: VoicePreferences },
  ): Promise<{ readonly microphone: boolean }>
  disconnect(): Promise<void>
  setMicrophone(enabled: boolean): Promise<void>
  setCamera(enabled: boolean): Promise<void>
  setScreenShare(enabled: boolean): Promise<void>
  /** Silences everyone else locally (deafen). */
  setDeafened(deafened: boolean): void
  /** New devices or processing apply to what is on right now, and to what comes on later. */
  setPreferences(preferences: VoicePreferences): Promise<void>
}

export type VoiceRoomFactory = (events: VoiceRoomEvents) => VoiceRoom

/** Remote audio plays through hidden elements the room creates; they live here. */
const audioSink = () => {
  const existing = document.getElementById('chinchi-voice-audio')
  if (existing) return existing
  const sink = document.createElement('div')
  sink.id = 'chinchi-voice-audio'
  sink.hidden = true
  document.body.append(sink)
  return sink
}

export const createLiveKitRoom: VoiceRoomFactory = (events) => {
  let deafened = false
  /** Whether the user wants to talk; a moderator's mute only takes the right away for a while. */
  let wantMicrophone = false
  let preferences: VoicePreferences | null = null
  /** Tiles kept per track, so a video element is not re-attached on every unrelated event. */
  const tileCache = new Map<string, { trackSid: string; tile: VideoTile }>()
  const room = new Room({ adaptiveStream: true, dynacast: true })

  /** The browser's own processing; noise suppression can be turned off (music, ASMR). */
  const microphoneOptions = (): AudioCaptureOptions => ({
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression: preferences?.noiseSuppression ?? true,
    ...(preferences?.audioInput ? { deviceId: preferences.audioInput } : {}),
  })

  const tiles = (): VideoTile[] =>
    [...room.remoteParticipants.values(), room.localParticipant].flatMap((participant) =>
      [...participant.trackPublications.values()].flatMap((publication) => {
        const track = publication.track
        const source =
          publication.source === Track.Source.Camera
            ? 'camera'
            : publication.source === Track.Source.ScreenShare
              ? 'screen'
              : null
        if (!track || !source || publication.isMuted) return []
        const key = `${participant.identity}:${source}`
        const cached = tileCache.get(key)
        if (cached?.trackSid === publication.trackSid) return [cached.tile]
        const tile: VideoTile = {
          key,
          userId: participant.identity,
          source,
          attach: (element: HTMLVideoElement) => void track.attach(element),
          detach: (element: HTMLVideoElement) => void track.detach(element),
        }
        tileCache.set(key, { trackSid: publication.trackSid, tile })
        return [tile]
      }),
    )

  const refreshVideo = () => events.onVideoChange(tiles())
  const playAudio = (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    const element = track.attach()
    element.muted = deafened
    audioSink().append(element)
  }

  room
    .on(RoomEvent.ActiveSpeakersChanged, (speakers) =>
      events.onSpeakingChange(speakers.map((speaker) => speaker.identity)),
    )
    .on(RoomEvent.TrackSubscribed, (track) => {
      playAudio(track)
      refreshVideo()
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove())
      refreshVideo()
    })
    .on(RoomEvent.LocalTrackPublished, refreshVideo)
    .on(RoomEvent.LocalTrackUnpublished, refreshVideo)
    .on(RoomEvent.TrackMuted, refreshVideo)
    .on(RoomEvent.TrackUnmuted, refreshVideo)
    .on(RoomEvent.ParticipantPermissionsChanged, (_previous, participant) => {
      // Server unmute: the microphone right is back, so is the microphone (if wanted).
      if (participant !== room.localParticipant || !wantMicrophone) return
      if (room.localParticipant.isMicrophoneEnabled) return
      room.localParticipant.setMicrophoneEnabled(true, microphoneOptions()).catch(() => undefined)
    })
    .on(RoomEvent.Disconnected, () => {
      refreshVideo()
      events.onDisconnected()
    })

  return {
    async connect(url, token, { microphone, preferences: chosen }) {
      preferences = chosen
      await room.connect(url, token)
      if (chosen.audioOutput) await room.switchActiveDevice('audiooutput', chosen.audioOutput)
      // Joining happens on a click, so the browser lets audio play.
      await room.startAudio()
      wantMicrophone = microphone
      if (!microphone) return { microphone: false }
      try {
        await room.localParticipant.setMicrophoneEnabled(true, microphoneOptions())
        return { microphone: true }
      } catch {
        // No device or no permission: stay in the call and listen.
        wantMicrophone = false
        return { microphone: false }
      }
    },
    async disconnect() {
      await room.disconnect()
    },
    async setMicrophone(enabled) {
      wantMicrophone = enabled
      await room.localParticipant.setMicrophoneEnabled(enabled, microphoneOptions())
    },
    async setCamera(enabled) {
      await room.localParticipant.setCameraEnabled(
        enabled,
        preferences?.videoInput ? { deviceId: preferences.videoInput } : {},
      )
      refreshVideo()
    },
    async setScreenShare(enabled) {
      await room.localParticipant.setScreenShareEnabled(enabled, { audio: true })
      refreshVideo()
    },
    setDeafened(value) {
      deafened = value
      for (const element of audioSink().querySelectorAll('audio')) element.muted = value
    },
    async setPreferences(next) {
      const previous = preferences
      preferences = next
      if (next.audioOutput && next.audioOutput !== previous?.audioOutput) {
        await room.switchActiveDevice('audiooutput', next.audioOutput)
      }
      if (next.videoInput && next.videoInput !== previous?.videoInput) {
        await room.switchActiveDevice('videoinput', next.videoInput)
      }
      const microphoneOn = room.localParticipant.isMicrophoneEnabled
      const changed =
        next.audioInput !== previous?.audioInput ||
        next.noiseSuppression !== previous?.noiseSuppression
      if (microphoneOn && changed) {
        // Capture settings only apply to a fresh track: restart the microphone with them.
        await room.localParticipant.setMicrophoneEnabled(false)
        await room.localParticipant.setMicrophoneEnabled(true, microphoneOptions())
      }
    },
  }
}
