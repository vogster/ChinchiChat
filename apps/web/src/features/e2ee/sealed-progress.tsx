import { Lock, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ProgressRing } from '../../components/ui/progress-ring'
import { percentOf } from '../media/use-download-progress'
import { formatFileSize } from '../messages/format-size'

import type { Progress } from '../media/use-download-progress'
import type { Ref } from 'react'

/**
 * A sealed file being opened, in two steps it names: the ciphertext comes down (a ring that
 * fills, with a cross in the middle to stop it), then it is decrypted here in one go.
 */
export const SealedProgress = ({
  name,
  progress,
  onCancel,
  focusCancel = false,
  width,
  ref,
}: {
  name: string
  progress: Progress
  onCancel: () => void
  /** Started by a click: the cancel button takes the focus the file button had. */
  focusCancel?: boolean
  /** The file button's width, kept while it is replaced. */
  width?: number | undefined
  ref?: Ref<HTMLDivElement>
}) => {
  const { t, i18n } = useTranslation()
  const cancel = useRef<HTMLButtonElement>(null)
  const percent = percentOf(progress)

  useEffect(() => {
    if (focusCancel) cancel.current?.focus()
  }, [focusCancel])

  return (
    <div
      ref={ref}
      style={width ? { width } : undefined}
      className="flex max-w-sm items-center gap-3 rounded-md border border-line bg-field px-3 py-2"
    >
      <span className="relative size-8 shrink-0">
        <ProgressRing percent={percent} label={t('e2ee.fileLoadingName', { name })} />
        <button
          ref={cancel}
          type="button"
          aria-label={t('e2ee.fileCancel', { name })}
          onClick={onCancel}
          className="absolute inset-1 grid place-items-center rounded-full text-muted hover:bg-chip hover:text-text"
        >
          <X aria-hidden className="size-4" />
        </button>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-accent">{name}</span>
        <span className="flex items-center gap-1 text-xs text-muted tabular-nums">
          <Lock aria-hidden className="size-3 shrink-0" />
          <span className="truncate">
            {percent < 100
              ? t('e2ee.fileProgress', {
                  percent,
                  received: formatFileSize(progress.received, i18n.language),
                  total: formatFileSize(progress.total, i18n.language),
                })
              : t('e2ee.fileDecrypting')}
          </span>
        </span>
      </span>
    </div>
  )
}
