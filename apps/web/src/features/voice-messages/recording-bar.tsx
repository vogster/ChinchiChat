import { ArrowUp, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from './waveform'

const METER_BARS = 5

/**
 * In place of the text field while recording: the clock, how loud the microphone hears you,
 * cancel (or Esc) and send.
 */
export const RecordingBar = ({
  seconds,
  level,
  onCancel,
  onSend,
}: {
  seconds: number
  level: number
  onCancel: () => void
  onSend: () => void
}) => {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="group"
      aria-label={t('voiceMessage.recording')}
      className="flex flex-1 items-center gap-2"
    >
      <button
        type="button"
        aria-label={t('voiceMessage.cancel')}
        title={t('voiceMessage.cancel')}
        onClick={onCancel}
        className="grid size-[38px] shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-stage hover:text-text"
      >
        <X aria-hidden className="size-5" />
      </button>
      <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-danger" />
      <span className="text-sm tabular-nums" aria-live="off">
        {formatDuration(seconds)}
      </span>
      <span aria-hidden className="flex h-5 items-center gap-[3px]">
        {Array.from({ length: METER_BARS }, (_, index) => (
          <span
            key={index}
            data-on={level * METER_BARS > index}
            className="h-full w-[3px] rounded-full bg-faint data-[on=true]:bg-accent"
          />
        ))}
      </span>
      <span className="flex-1 truncate text-sm text-muted">{t('voiceMessage.escHint')}</span>
      <button
        type="button"
        aria-label={t('voiceMessage.send')}
        title={t('voiceMessage.send')}
        onClick={onSend}
        className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent text-accent-contrast transition hover:brightness-110"
      >
        <ArrowUp aria-hidden className="size-5" />
      </button>
    </div>
  )
}
