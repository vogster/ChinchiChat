import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { decodeVoice } from './decode-audio'
import { playOnly } from './one-at-a-time'
import { formatDuration, WAVEFORM_BARS } from './waveform'

import type { KeyboardEvent, MouseEvent } from 'react'

const FLAT = Array.from({ length: WAVEFORM_BARS }, () => 0.08)
const SEEK_STEP_S = 5

interface Loaded {
  readonly url: string
  readonly duration: number
  readonly waveform: readonly number[]
}

/**
 * A voice message in the feed: play, its waveform with the progress over it (click or arrow
 * keys to seek), and the time. `load` gives the audio (fetched, or decrypted on this device).
 */
export const VoicePlayer = ({ load, name }: { load: () => Promise<Blob>; name: string }) => {
  const { t } = useTranslation()
  const audio = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<Loaded | 'loading' | 'failed'>('loading')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  // What the element reports, for when decoding could not tell (no Web Audio).
  const [mediaDuration, setMediaDuration] = useState(0)

  const loader = useRef(load)
  useEffect(() => {
    let current = true
    let url: string | null = null
    loader
      .current()
      .then(async (blob) => {
        const decoded = await decodeVoice(blob)
        if (!current) return
        url = URL.createObjectURL(blob)
        setState({ url, duration: decoded?.duration ?? 0, waveform: decoded?.waveform ?? FLAT })
      })
      .catch(() => current && setState('failed'))
    return () => {
      current = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  if (state === 'failed') {
    return (
      <p role="alert" className="text-sm text-danger">
        {t('voiceMessage.failedFile', { name })}
      </p>
    )
  }

  const loaded = state === 'loading' ? null : state
  const duration = loaded?.duration || mediaDuration
  const shown = Number.isFinite(duration) ? duration : 0
  const progress = shown > 0 ? Math.min(1, time / shown) : 0
  const waveform = loaded?.waveform ?? FLAT

  const seek = (to: number) => {
    const element = audio.current
    if (!element || shown <= 0) return
    element.currentTime = Math.max(0, Math.min(shown, to))
    setTime(element.currentTime)
  }

  const toggle = () => {
    const element = audio.current
    if (!element) return
    if (element.paused) void playOnly(element).catch(() => setPlaying(false))
    else element.pause()
  }

  const onWaveClick = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0) seek(((event.clientX - box.left) / box.width) * shown)
  }

  const onWaveKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = {
      ArrowRight: time + SEEK_STEP_S,
      ArrowUp: time + SEEK_STEP_S,
      ArrowLeft: time - SEEK_STEP_S,
      ArrowDown: time - SEEK_STEP_S,
      Home: 0,
      End: shown,
    }[event.key]
    if (to === undefined) return
    event.preventDefault()
    seek(to)
  }

  return (
    <div className="flex w-72 max-w-full items-center gap-3 rounded-[22px] bg-field py-2 pr-4 pl-2">
      {loaded ? (
        <audio
          ref={audio}
          src={loaded.url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setTime(0)
          }}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onDurationChange={(event) => setMediaDuration(event.currentTarget.duration)}
        />
      ) : null}
      <button
        type="button"
        disabled={!loaded}
        aria-label={
          playing
            ? t('voiceMessage.pause')
            : t('voiceMessage.play', { duration: formatDuration(shown) })
        }
        onClick={toggle}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast transition hover:brightness-110 disabled:opacity-60"
      >
        {playing ? (
          <Pause aria-hidden className="size-4" />
        ) : (
          <Play aria-hidden className="size-4 translate-x-px" />
        )}
      </button>
      <div
        role="slider"
        tabIndex={loaded ? 0 : -1}
        aria-label={t('voiceMessage.position')}
        aria-valuemin={0}
        aria-valuemax={Math.round(shown)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={t('voiceMessage.positionText', {
          time: formatDuration(time),
          duration: formatDuration(shown),
        })}
        onClick={onWaveClick}
        onKeyDown={onWaveKey}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px] rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {waveform.map((level, index) => (
          <span
            key={index}
            aria-hidden
            data-played={index / waveform.length < progress}
            style={{ height: `${Math.round(level * 100)}%` }}
            className="min-h-[3px] flex-1 rounded-full bg-faint data-[played=true]:bg-accent"
          />
        ))}
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
        {formatDuration(playing || time > 0 ? time : shown)}
      </span>
    </div>
  )
}
