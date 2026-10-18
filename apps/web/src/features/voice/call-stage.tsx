import { MicOff } from 'lucide-react'
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
  large,
}: {
  state: VoiceState
  name: string
  user: PublicUser | null
  speaking: boolean
  video: VideoTile | undefined
  large: boolean
}) => {
  const { t } = useTranslation()
  const words = voiceStateWords(t, state, speaking)
  const muted = state.selfMute || state.serverMute || state.selfDeaf || state.serverDeaf
  return (
    <li
      aria-label={words.length > 0 ? `${name} (${words.join(', ')})` : name}
      data-speaking={speaking}
      className="relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[28px] bg-stage transition-shadow duration-200 data-[speaking=true]:shadow-[inset_0_0_0_2px_var(--zl-accent)]"
    >
      {video ? (
        <VideoView tile={video} />
      ) : (
        <span
          data-speaking={speaking}
          className="rounded-[36%] transition-shadow duration-200 data-[speaking=true]:shadow-[0_0_0_3px_var(--zl-rail),0_0_0_6px_var(--zl-accent)]"
        >
          <Avatar
            name={name}
            src={user?.avatarUrl ?? null}
            id={user?.id}
            rounded="rounded-[36%]"
            className={large ? 'size-[132px] text-5xl' : 'size-24 text-3xl'}
          />
        </span>
      )}
      <span className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-side px-3 py-1 text-[13px] font-medium">
        <span className="truncate">{name}</span>
        {muted ? <MicOff aria-hidden className="size-3.5 shrink-0 text-danger" /> : null}
      </span>
    </li>
  )
}

/** Everyone in a call as tiles: video when they share it (to those in the call), else avatar. */
export const CallStage = ({
  states,
  channelId,
  person,
  layout = 'grid',
  large = false,
}: {
  states: readonly VoiceState[]
  channelId: string
  person: (userId: string) => { name: string; user: PublicUser | null }
  /** `row`: a DM call, tiles side by side filling the block; `grid` for a voice channel. */
  layout?: 'grid' | 'row'
  /** Bigger avatars, for a call shown over the whole chat. */
  large?: boolean
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
      className={
        layout === 'row'
          ? 'flex min-h-0 flex-1 justify-center gap-3 *:max-h-[340px] *:max-w-[420px] *:flex-1'
          : // Phones: portrait tiles, two to a row.
            'grid grid-cols-2 gap-3 *:aspect-[3/4] md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] md:*:aspect-video'
      }
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
            large={large}
          />
        )
      })}
    </ul>
  )
}
