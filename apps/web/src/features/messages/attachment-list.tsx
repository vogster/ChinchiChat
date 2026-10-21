import { isInlineAudio, isInlineImage } from '@chinchi/shared'
import { Download, FileText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMediaUrl } from '../media/media-base'
import { VoicePlayer } from '../voice-messages/voice-player'
import { formatFileSize } from './format-size'
import { ImageViewer } from './image-viewer'

import type { Attachment } from '@chinchi/shared'

/** Images show at most this big in the feed; the viewer shows the original. */
const MAX_WIDTH = 400
const MAX_HEIGHT = 300

/** "PDF" from "report.pdf"; nothing for a name without an extension. */
const extensionOf = (filename: string) => {
  const dot = filename.lastIndexOf('.')
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1).toUpperCase() : null
}

/** Display size that fits the box, so the feed does not jump when the image loads. */
const fit = (width: number | null, height: number | null) => {
  if (!width || !height) return {}
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const fetchBlob = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  return response.blob()
}

/** A message's files: images open in the viewer, voice plays here, everything else downloads. */
export const AttachmentList = ({ attachments }: { attachments: readonly Attachment[] }) => {
  const { t, i18n } = useTranslation()
  const [viewing, setViewing] = useState<Attachment | null>(null)
  const media = useMediaUrl()
  if (attachments.length === 0) return null

  return (
    <ul className="flex max-w-full flex-col items-start gap-1.5">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {isInlineAudio(attachment.contentType) ? (
            <VoicePlayer name={attachment.filename} load={() => fetchBlob(media(attachment.url))} />
          ) : isInlineImage(attachment.contentType) ? (
            <button
              type="button"
              aria-label={t('messages.openImage', { name: attachment.filename })}
              onClick={() => setViewing(attachment)}
              className="block overflow-hidden rounded-[20px] bg-field"
            >
              <img
                data-native-menu
                src={media(attachment.previewUrl ?? attachment.url)}
                alt={attachment.filename}
                loading="lazy"
                {...fit(attachment.width, attachment.height)}
                className="max-h-[300px] max-w-[min(400px,100%)] object-contain"
              />
            </button>
          ) : (
            <a
              href={media(attachment.url)}
              download={attachment.filename}
              aria-label={`${attachment.filename} (${formatFileSize(attachment.size, i18n.language)})`}
              className="group/file flex w-[min(340px,100%)] items-center gap-3 rounded-[18px] bg-field p-2.5 transition hover:brightness-105"
            >
              <span
                aria-hidden
                className="grid size-[42px] shrink-0 place-items-center rounded-field bg-accent-soft text-accent-text"
              >
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{attachment.filename}</span>
                <span className="block text-xs text-faint">
                  {[
                    formatFileSize(attachment.size, i18n.language),
                    extensionOf(attachment.filename),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-stage text-muted group-hover/file:text-text"
              >
                <Download className="size-4" />
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
