import { isInlineImage } from '@chinchi/shared'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from './format-size'
import { ImageViewer } from './image-viewer'

import type { Attachment } from '@chinchi/shared'

/** Images show at most this big in the feed; the viewer shows the original. */
const MAX_WIDTH = 400
const MAX_HEIGHT = 300

/** Display size that fits the box, so the feed does not jump when the image loads. */
const fit = (width: number | null, height: number | null) => {
  if (!width || !height) return {}
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** A message's files: images open in the viewer, everything else downloads. */
export const AttachmentList = ({ attachments }: { attachments: readonly Attachment[] }) => {
  const { t, i18n } = useTranslation()
  const [viewing, setViewing] = useState<Attachment | null>(null)
  if (attachments.length === 0) return null

  return (
    <ul className="mt-1 flex flex-col items-start gap-1.5">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {isInlineImage(attachment.contentType) ? (
            <button
              type="button"
              aria-label={t('messages.openImage', { name: attachment.filename })}
              onClick={() => setViewing(attachment)}
              className="block overflow-hidden rounded-md bg-elevated"
            >
              <img
                src={attachment.previewUrl ?? attachment.url}
                alt={attachment.filename}
                loading="lazy"
                {...fit(attachment.width, attachment.height)}
                className="max-h-[300px] max-w-[min(400px,100%)] object-contain"
              />
            </button>
          ) : (
            <a
              href={attachment.url}
              download={attachment.filename}
              aria-label={`${attachment.filename} (${formatFileSize(attachment.size, i18n.language)})`}
              className="flex max-w-sm items-center gap-3 rounded-md border border-border bg-elevated px-3 py-2 hover:bg-hover"
            >
              <FileText aria-hidden className="size-8 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-accent">{attachment.filename}</span>
                <span className="block text-xs text-muted">
                  {formatFileSize(attachment.size, i18n.language)}
                </span>
              </span>
            </a>
          )}
        </li>
      ))}
      {viewing ? (
        <ImageViewer image={viewing} onOpenChange={(open) => !open && setViewing(null)} />
      ) : null}
    </ul>
  )
}
