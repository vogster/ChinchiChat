import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { useVoice } from './voice-context'
import { voiceStateWords } from './voice-words'

import type { VideoTile } from './voice-room'
import type { PublicUser, VoiceState } from '@chinchi/shared'

const VideoView = ({ tile }: { tile: VideoTile }) => {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    tile.attach(element)
    return () => tile.detach(element)
  }, [tile])
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      data-source={tile.source}
      className="size-full bg-black object-cover data-[source=screen]:object-contain"
    />
  )
}

const Tile = ({
  state,
  name,
  user,
  speaking,
  video,
}: {
  state: VoiceState
  name: string
  user: PublicUser | null
  speaking: boolean
  video: VideoTile | undefined
}) => {
  const { t } = useTranslation()
  const words = voiceStateWords(t, state, speaking)
  return (
    <li
      aria-label={words.length > 0 ? `${name} (${words.join(', ')})` : name}
      data-speaking={speaking}
      className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-elevated outline-offset-2 data-[speaking=true]:outline-2 data-[speaking=true]:outline-green-500"
    >
      {video ? (
        <VideoView tile={video} />
      ) : (
        <Avatar
          name={name}
          src={user?.avatarUrl ?? null}
          id={user?.id}
          className="size-20 text-3xl"
        />
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-sm text-white">
        {name}
      </span>
    </li>
  )
}

/** Everyone in a call as tiles: video when they share it (to those in the call), else avatar. */
export const CallStage = ({
  states,
  channelId,
  person,
}: {
  states: readonly VoiceState[]
  channelId: string
  person: (userId: string) => { name: string; user: PublicUser | null }
}) => {
  const { t } = useTranslation()
  const voice = useVoice()
  const here = voice.channelId === channelId && voice.status !== 'idle'
  // A screen share is worth more than the camera when someone has both on.
  const videoOf = (userId: string) =>
    here
      ? (voice.videos.find((v) => v.userId === userId && v.source === 'screen') ??
        voice.videos.find((v) => v.userId === userId && v.source === 'camera'))
      : undefined

  return (
    <ul
      aria-label={t('voice.stage')}
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3"
    >
      {states.map((state) => {
        const { name, user } = person(state.userId)
        return (
          <Tile
            key={state.userId}
            state={state}
            name={name}
            user={user}
            speaking={here && voice.speaking.includes(state.userId)}
            video={videoOf(state.userId)}
          />
        )
      })}
    </ul>
  )
}
