import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useVoice } from './voice-context'

import type { ReactNode } from 'react'

// One colour set per state (see AGENTS.md, Tailwind): off in red, on in the accent.
const base =
  'grid size-[52px] shrink-0 place-items-center rounded-full transition hover:brightness-115 disabled:opacity-50 max-md:size-14'
const neutral = `${base} bg-chip text-text`
const dangerOff = `${base} bg-danger-soft text-danger`
const accentOn = `${base} bg-accent-soft text-accent-text`

const DockButton = ({
  label,
  pressed,
  className,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  className: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={className}
  >
    {children}
  </button>
)

/**
 * The call's controls, the same in a DM call and a voice channel: microphone, camera, screen
 * (not on phones), sound, then hang up. They share state with the user panel's buttons.
 */
export const CallDock = () => {
  const { t } = useTranslation()
  const voice = useVoice()
  const connected = voice.status === 'connected'
  const micOn = !voice.selfMute && !voice.selfDeaf

  return (
    <section
      aria-label={t('voice.dock')}
      className="mx-auto flex items-center gap-2 rounded-[34px] bg-side p-2 shadow-[0_0_0_1px_var(--zl-line)]"
    >
      <DockButton
        label={t('voice.dockMic')}
        pressed={micOn}
        className={micOn ? neutral : dangerOff}
        onClick={voice.toggleMute}
      >
        {micOn ? <Mic aria-hidden className="size-5" /> : <MicOff aria-hidden className="size-5" />}
      </DockButton>
      <DockButton
        label={t('voice.dockCamera')}
        pressed={voice.camera}
        disabled={!connected}
        className={voice.camera ? accentOn : neutral}
        onClick={voice.toggleCamera}
      >
        {voice.camera ? (
          <Video aria-hidden className="size-5" />
        ) : (
          <VideoOff aria-hidden className="size-5" />
        )}
      </DockButton>
      <span className="max-md:hidden">
        <DockButton
          label={t('voice.dockScreen')}
          pressed={voice.screen}
          disabled={!connected}
          className={voice.screen ? accentOn : neutral}
          onClick={voice.toggleScreen}
        >
          <MonitorUp aria-hidden className="size-5" />
        </DockButton>
      </span>
      <DockButton
        label={t('voice.dockSound')}
        pressed={!voice.selfDeaf}
        className={voice.selfDeaf ? dangerOff : neutral}
        onClick={voice.toggleDeaf}
      >
        {voice.selfDeaf ? (
          <HeadphoneOff aria-hidden className="size-5" />
        ) : (
          <Headphones aria-hidden className="size-5" />
        )}
      </DockButton>
      <span aria-hidden className="mx-1 h-7 w-px bg-line" />
      <button
        type="button"
        aria-label={t('voice.leave')}
        title={t('voice.leave')}
        onClick={() => void voice.leave()}
        className="grid h-[52px] w-[72px] shrink-0 place-items-center rounded-[26px] bg-danger text-danger-contrast transition hover:brightness-110 max-md:h-14"
      >
        <PhoneOff aria-hidden className="size-5" />
      </button>
    </section>
  )
}
