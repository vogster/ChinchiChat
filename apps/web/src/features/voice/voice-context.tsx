import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { CodedError } from '../../lib/errors'
import { declineCall } from './queries'
import { getVoicePreferences, subscribeVoicePreferences } from './voice-preferences'
import { createLiveKitRoom } from './voice-room'

import type { VideoTile, VoiceRoom, VoiceRoomFactory } from './voice-room'
import type { Snowflake } from '@chinchi/shared'
import type { ReactNode } from 'react'

export interface VoiceSession {
  readonly status: 'idle' | 'connecting' | 'connected'
  readonly guildId: Snowflake | null
  readonly channelId: Snowflake | null
  /** Kept between connections, like Discord: you rejoin as muted as you left. */
  readonly selfMute: boolean
  readonly selfDeaf: boolean
  readonly camera: boolean
  readonly screen: boolean
  readonly speaking: readonly Snowflake[]
  readonly videos: readonly VideoTile[]
  readonly error: unknown
}

export interface VoiceControls extends VoiceSession {
  /** A server voice channel, or a DM call (`guildId: null`). */
  readonly join: (guildId: Snowflake | null, channelId: Snowflake) => Promise<void>
  readonly leave: () => Promise<void>
  readonly toggleMute: () => void
  readonly toggleDeaf: () => void
  readonly toggleCamera: () => void
  readonly toggleScreen: () => void
}

const IDLE: VoiceSession = {
  status: 'idle',
  guildId: null,
  channelId: null,
  selfMute: false,
  selfDeaf: false,
  camera: false,
  screen: false,
  speaking: [],
  videos: [],
  error: null,
}

const VoiceRoomFactoryContext = createContext<VoiceRoomFactory>(createLiveKitRoom)
const VoiceContext = createContext<VoiceControls | null>(null)

export const VoiceRoomFactoryProvider = VoiceRoomFactoryContext.Provider

/** One voice connection per signed-in user, shared by the whole chat. */
export const VoiceProvider = ({ children }: { children: ReactNode }) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const factory = useContext(VoiceRoomFactoryContext)
  const [session, setSession] = useState<VoiceSession>(IDLE)
  const latest = useRef(session)
  const room = useRef<VoiceRoom | null>(null)
  /** Bumped by every join and leave: a slower, older attempt notices it lost and backs out. */
  const attempt = useRef(0)

  const update = useCallback((change: Partial<VoiceSession>) => {
    latest.current = { ...latest.current, ...change }
    setSession(latest.current)
  }, [])

  /** Back to idle, keeping the user's mute and deafen choice. */
  const reset = useCallback(
    (error: unknown = null) =>
      update({
        ...IDLE,
        selfMute: latest.current.selfMute,
        selfDeaf: latest.current.selfDeaf,
        error,
      }),
    [update],
  )

  const leave = useCallback(async () => {
    attempt.current += 1
    const current = room.current
    const { guildId, channelId } = latest.current
    room.current = null
    reset()
    // Hanging up on a DM call that goes on without you is not an incoming call.
    if (guildId === null && channelId) declineCall(queryClient, channelId)
    await current?.disconnect()
  }, [reset, queryClient])

  const join = useCallback(
    async (guildId: Snowflake | null, channelId: Snowflake) => {
      if (latest.current.channelId === channelId && latest.current.status !== 'idle') return
      const mine = ++attempt.current
      const current = () => attempt.current === mine
      // The server ends the previous connection itself when the new token is issued.
      const previous = room.current
      room.current = null
      void previous?.disconnect()
      update({ ...IDLE, ...pick(latest.current), status: 'connecting', guildId, channelId })
      const { selfMute, selfDeaf } = latest.current
      let next: VoiceRoom | null = null
      try {
        const { connection } = await api.voice.join(channelId, { selfMute, selfDeaf })
        // Left or moved on while the token was on its way: don't connect at all.
        if (!current()) return
        const created: VoiceRoom = factory({
          onSpeakingChange: (speaking) => {
            if (room.current === created) update({ speaking })
          },
          onVideoChange: (videos) => {
            if (room.current === created) update({ videos })
          },
          onDisconnected: () => {
            if (room.current !== created) return
            room.current = null
            reset()
          },
        })
        next = created
        room.current = created
        const wanted = !selfMute && !selfDeaf
        const { microphone } = await created.connect(connection.url, connection.token, {
          microphone: wanted,
          preferences: getVoicePreferences(),
        })
        if (!current()) {
          void created.disconnect()
          return
        }
        created.setDeafened(selfDeaf)
        update({ status: 'connected' })
        if (wanted && !microphone) {
          // Listening only: show it as muted, to the user and to everyone else.
          update({ selfMute: true, error: new CodedError('MICROPHONE_UNAVAILABLE') })
          void api.voice.updateState({ selfMute: true, selfDeaf }).catch(() => undefined)
        }
      } catch (error) {
        void next?.disconnect()
        // Only the newest attempt owns the session; an abandoned one fails quietly.
        if (!current()) return
        room.current = null
        reset(error)
      }
    },
    [api, factory, update, reset],
  )

  /** Applies mute/deafen to the room and tells the server (others see the icons). */
  const applySelf = useCallback(
    (selfMute: boolean, selfDeaf: boolean) => {
      const before = latest.current
      update({ selfMute, selfDeaf })
      const current = room.current
      if (!current || before.status !== 'connected') return
      current.setDeafened(selfDeaf)
      const tell = (mute: boolean) =>
        void api.voice.updateState({ selfMute: mute, selfDeaf }).catch(() => undefined)
      current.setMicrophone(!selfMute && !selfDeaf).then(
        () => tell(selfMute),
        // No device, no permission, or muted by a moderator: the microphone stays off.
        () => {
          update({ selfMute: true, error: new CodedError('MICROPHONE_UNAVAILABLE') })
          tell(true)
        },
      )
    },
    [api, update],
  )

  const toggleMute = useCallback(() => {
    const { selfMute, selfDeaf } = latest.current
    // Unmuting while deafened brings the sound back too.
    if (selfDeaf && selfMute) return applySelf(false, false)
    applySelf(!selfMute, selfDeaf)
  }, [applySelf])

  const toggleDeaf = useCallback(() => {
    const { selfMute, selfDeaf } = latest.current
    applySelf(selfMute, !selfDeaf)
  }, [applySelf])

  const toggleMedia = useCallback(
    (kind: 'camera' | 'screen') => {
      const current = room.current
      if (!current || latest.current.status !== 'connected') return
      const enabled = !latest.current[kind]
      const action =
        kind === 'camera' ? current.setCamera(enabled) : current.setScreenShare(enabled)
      action.then(
        () => update({ [kind]: enabled }),
        // Permission denied or the picker was closed: stay as we were.
        (error: unknown) => update({ error }),
      )
    },
    [update],
  )

  // Devices picked in settings apply to the call in progress.
  useEffect(
    () =>
      subscribeVoicePreferences(() => {
        void room.current?.setPreferences(getVoicePreferences()).catch(() => undefined)
      }),
    [],
  )

  // Signing out (the provider unmounts) ends the call.
  useEffect(
    () => () => {
      void room.current?.disconnect()
      room.current = null
    },
    [],
  )

  const value = useMemo<VoiceControls>(
    () => ({
      ...session,
      join,
      leave,
      toggleMute,
      toggleDeaf,
      toggleCamera: () => toggleMedia('camera'),
      toggleScreen: () => toggleMedia('screen'),
    }),
    [session, join, leave, toggleMute, toggleDeaf, toggleMedia],
  )
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

const pick = ({ selfMute, selfDeaf }: VoiceSession) => ({ selfMute, selfDeaf })

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useVoice = (): VoiceControls => {
  const value = useContext(VoiceContext)
  if (!value) throw new Error('useVoice must be used inside <VoiceProvider>')
  return value
}
