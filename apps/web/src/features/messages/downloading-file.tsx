import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ProgressRing } from '../../components/ui/progress-ring'
import { percentOf } from '../media/use-download-progress'
import { formatFileSize } from './format-size'

import type { Progress } from '../media/use-download-progress'
import type { Ref } from 'react'

/**
 * A file on its way to "Save as", in place of its link: a ring that fills as it comes down,
 * with a cross in the middle to stop it (it takes the focus: a click on the link started it).
 */
export const DownloadingFile = ({
  name,
  progress,
  onCancel,
  width,
  ref,
}: {
  name: string
  progress: Progress
  onCancel: () => void
  /** The link's width, kept while it is replaced. */
  width?: number | undefined
  ref?: Ref<HTMLDivElement>
}) => {
  const { t, i18n } = useTranslation()
  const cancel = useRef<HTMLButtonElement>(null)
  const percent = percentOf(progress)

  useEffect(() => cancel.current?.focus(), [])

  return (
    <div
      ref={ref}
      style={width ? { width } : undefined}
      className="flex max-w-full items-center gap-3 rounded-[18px] bg-field p-2.5"
    >
      <span className="relative size-[42px] shrink-0">
        <ProgressRing
          percent={percent}
          label={t('messages.downloadLabel', { name })}
          className="size-[42px]"
        />
        <button
          ref={cancel}
          type="button"
          aria-label={t('messages.downloadCancel', { name })}
          onClick={onCancel}
          className="absolute inset-1.5 grid place-items-center rounded-full text-muted hover:bg-chip hover:text-text"
        >
          <X aria-hidden className="size-4" />
        </button>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-xs text-faint tabular-nums">
          {percent < 100
            ? t('messages.downloadProgress', {
                percent,
                received: formatFileSize(progress.received, i18n.language),
                total: formatFileSize(progress.total, i18n.language),
              })
            : t('messages.downloadSaving')}
        </span>
      </span>
    </div>
  )
}
