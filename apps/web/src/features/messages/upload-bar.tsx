import { useTranslation } from 'react-i18next'

import { formatFileSize } from './format-size'

/** How far a sending message's files have gone up: a bar, the percent and the bytes. */
export const UploadBar = ({
  upload,
  mine,
}: {
  upload: { readonly sent: number; readonly total: number }
  mine: boolean
}) => {
  const { t, i18n } = useTranslation()
  const percent =
    upload.total > 0 ? Math.min(100, Math.floor((upload.sent / upload.total) * 100)) : 100
  return (
    <div className={`flex w-[min(280px,100%)] flex-col gap-1 ${mine ? 'items-end' : ''}`}>
      <div
        role="progressbar"
        aria-label={t('messages.uploadLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-field"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-[11.5px] text-faint tabular-nums">
        {percent < 100
          ? t('messages.uploading', {
              percent,
              sent: formatFileSize(upload.sent, i18n.language),
              total: formatFileSize(upload.total, i18n.language),
            })
          : t('messages.uploadDone')}
      </span>
    </div>
  )
}
