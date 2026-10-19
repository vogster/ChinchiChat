import { useTranslation } from 'react-i18next'

import { formatFileSize } from './format-size'

const RADIUS = 15
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * A sending message's files in one pill: a ring that fills as they go up, their name, the
 * percent and the bytes.
 */
export const UploadBar = ({
  upload,
  files,
}: {
  upload: { readonly sent: number; readonly total: number }
  files: readonly File[]
}) => {
  const { t, i18n } = useTranslation()
  const percent =
    upload.total > 0 ? Math.min(100, Math.floor((upload.sent / upload.total) * 100)) : 100
  return (
    <div className="flex max-w-[min(320px,100%)] items-center gap-2.5 rounded-full bg-field py-1 pr-4 pl-1">
      <svg
        role="progressbar"
        aria-label={t('messages.uploadLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        viewBox="0 0 36 36"
        className="size-8 shrink-0 -rotate-90"
      >
        <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3.5" className="stroke-chip" />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
          className="stroke-accent transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
        />
      </svg>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium">
          {files.length > 1
            ? t('messages.uploadingMany', { name: files[0]?.name, count: files.length - 1 })
            : files[0]?.name}
        </span>
        <span className="text-[11.5px] text-faint tabular-nums">
          {percent < 100
            ? t('messages.uploading', {
                percent,
                sent: formatFileSize(upload.sent, i18n.language),
                total: formatFileSize(upload.total, i18n.language),
              })
            : t('messages.uploadDone')}
        </span>
      </span>
    </div>
  )
}
