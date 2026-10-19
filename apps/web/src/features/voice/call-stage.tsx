import { MicOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { useVoice } from './voice-context'
import { voiceStateWords } from './voice-words'

import type { VideoTile } from './voice-room'
import type { PublicUser, VoiceState } from '@chinchi/shared'

/** `whole`: the full frame (a blown-up camera), not cropped to the tile. */
const VideoView = ({ tile, whole = false }: { tile: VideoTile; whole?: boolean }) => {
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
      data-whole={whole || undefined}
      className="size-full bg-black object-cover data-whole:object-contain data-[source=screen]:object-contain"
    />
  )
}

/**
 * A steady hue per person, for the tint of their tile in a voice channel. FNV-1a, so ids that
 * differ in a digit or two (Snowflakes made close together) still land far apart.
 */
const hueOf = (id: string) => {
  let hash = 0x811c9dc5
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
  return (hash >>> 0) % 360
}

const Tile = ({
  state,
  name,
  user,
  speaking,
  video,
  large,
  look,
  focused,
  onToggleFocus,
  fit,
}: {
  state: VoiceState
  name: string
  user: PublicUser | null
  speaking: boolean
  video: VideoTile | undefined
  large: boolean
  /** `channel`: a voice channel's tinted 4:3 tile; `call`: a DM call's plain one. */
  look: 'channel' | 'call'
  /** Blown up over the stage (see CallStage). */
  focused: boolean
  onToggleFocus: () => void
  /** Its place in the focus layout; the grid and row layouts size tiles themselves. */
  fit?: 'focused' | 'thumb' | undefined
}) => {
  const { t } = useTranslation()
  const words = voiceStateWords(t, state, speaking)
  const muted = state.selfMute || state.serverMute || state.selfDeaf || state.serverDeaf
  const channel = look === 'channel'
  return (
    <li
      aria-label={words.length > 0 ? `${name} (${words.join(', ')})` : name}
      data-speaking={speaking}
      data-focused={focused || undefined}
      // The tint follows the theme's lightness (`--zl-tile-l`) and the person's hue.
      style={
        channel
          ? { backgroundColor: `oklch(var(--zl-tile-l) 0.04 ${hueOf(state.userId)})` }
          : undefined
      }
      className={`${fit === 'focused' ? 'h-[min(62vh,560px)] w-full shrink-0' : fit === 'thumb' ? 'aspect-video h-24 shrink-0 sm:h-28' : ''} relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-[28px] transition-shadow duration-200 ${channel ? 'data-[speaking=true]:shadow-[inset_0_0_0_4px_var(--zl-accent)]' : 'bg-stage data-[speaking=true]:shadow-[inset_0_0_0_2px_var(--zl-accent)]'}`}
    >
      {video ? (
        <VideoView tile={video} whole={fit === 'focused'} />
      ) : (
        <span
          data-speaking={speaking}
          className={
            channel
              ? 'rounded-[32px]'
              : 'rounded-[36%] transition-shadow duration-200 data-[speaking=true]:shadow-[0_0_0_3px_var(--zl-rail),0_0_0_6px_var(--zl-accent)]'
          }
        >
          <Avatar
            name={name}
            src={user?.avatarUrl ?? null}
            id={user?.id}
            rounded={channel ? 'rounded-[32px]' : 'rounded-[36%]'}
            className={
              fit === 'thumb'
                ? 'size-14 text-lg'
                : channel
                  ? 'size-[92px] text-3xl'
                  : large
                    ? 'size-[132px] text-5xl'
                    : 'size-24 text-3xl'
            }
          />
        </span>
      )}
      {video ? (
        // The whole tile is the target; the name chip stays readable above it.
        <button
          type="button"
          aria-pressed={focused}
          aria-label={t(focused ? 'voice.unfocus' : 'voice.focus', { name })}
          title={t(focused ? 'voice.unfocus' : 'voice.focus', { name })}
          onClick={onToggleFocus}
          className="absolute inset-0 cursor-zoom-in rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent aria-pressed:cursor-zoom-out"
        />
      ) : null}
      {channel ? (
        <span className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-[14px] bg-[rgb(15_15_22/0.5)] px-3 py-1.5 text-[12.5px] font-medium text-white backdrop-blur-md">
          <span className="truncate">{name}</span>
          {muted ? (
            <MicOff
              aria-hidden
              data-icon="muted"
              className="size-3.5 shrink-0 text-[oklch(0.82_0.12_25)]"
            />
          ) : null}
        </span>
      ) : (
        <span className="absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-side px-3 py-1 text-[13px] font-medium">
          <span className="truncate">{name}</span>
          {muted ? (
            <MicOff aria-hidden data-icon="muted" className="size-3.5 shrink-0 text-danger" />
          ) : null}
        </span>
      )}
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
  // Someone's screen or camera blown up; gone with their video (or them).
  const [chosen, setChosen] = useState<string | null>(null)
  const focus = chosen && states.some((s) => s.userId === chosen) && videoOf(chosen) ? chosen : null
  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChosen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])
  const shown = focus ? 'focus' : layout
  // The blown-up tile first, the rest in a strip under it.
  const ordered = focus
    ? [...states.filter((s) => s.userId === focus), ...states.filter((s) => s.userId !== focus)]
    : states

  return (
    <ul
      aria-label={t('voice.stage')}
      data-layout={shown}
      className={
        shown === 'focus'
          ? 'flex min-h-0 flex-1 flex-wrap content-start justify-center gap-3'
          : shown === 'row'
            ? 'flex min-h-0 flex-1 justify-center gap-3 *:max-h-[340px] *:max-w-[420px] *:flex-1'
            : // Phones: portrait tiles, two to a row; wider: 4:3 tiles of at least 260px.
              'grid grid-cols-2 gap-3 *:aspect-[3/4] md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:*:aspect-[4/3]'
      }
    >
      {ordered.map((state) => {
        const { name, user } = person(state.userId)
        const focused = state.userId === focus
        return (
          <Tile
            key={state.userId}
            state={state}
            name={name}
            user={user}
            speaking={here && voice.speaking.includes(state.userId)}
            video={videoOf(state.userId)}
            large={large && !focus}
            look={layout === 'grid' ? 'channel' : 'call'}
            focused={focused}
            onToggleFocus={() => setChosen(focused ? null : state.userId)}
            fit={!focus ? undefined : focused ? 'focused' : 'thumb'}
          />
        )
      })}
    </ul>
  )
}
