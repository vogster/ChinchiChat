import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/dialog'

import type { Attachment } from '@chinchi/shared'

export interface ImageViewerProps {
  readonly image: Attachment
  readonly onOpenChange: (open: boolean) => void
}

/** The original image, as large as the window allows; Escape or the close button closes it. */
export const ImageViewer = ({ image, onOpenChange }: ImageViewerProps) => {
  const { t } = useTranslation()
  return (
    <Dialog open onOpenChange={onOpenChange} title={image.filename} size="lg">
      <img
        src={image.url}
        alt={image.filename}
        className="mx-auto max-h-[75vh] w-auto max-w-full rounded object-contain"
      />
      <a
        href={image.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
      >
        {t('messages.openOriginal')}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </Dialog>
  )
}
