import { Download, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { saveBlob } from '../../lib/save-file'

import type { Attachment } from '@chinchi/shared'

export interface ImageViewerProps {
  readonly image: Attachment
  readonly onOpenChange: (open: boolean) => void
}

/**
 * Fetched rather than a plain `<a download>`: images are served inline from the file domain,
 * and browsers ignore `download` on another origin.
 */
const downloadImage = async (image: Attachment) => {
  const response = await fetch(image.url)
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  saveBlob(image.filename, await response.blob())
}

/** The original image, as large as the window allows; Escape or the close button closes it. */
export const ImageViewer = ({ image, onOpenChange }: ImageViewerProps) => {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')

  const download = async () => {
    setState('loading')
    try {
      await downloadImage(image)
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title={image.filename} size="lg">
      <img
        src={image.url}
        alt={image.filename}
        className="mx-auto max-h-[75vh] w-auto max-w-full rounded object-contain"
      />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button
          variant="secondary"
          fullWidth={false}
          pending={state === 'loading'}
          onClick={() => void download()}
          className="inline-flex items-center gap-2"
        >
          <Download aria-hidden className="size-4" />
          {t('messages.download')}
        </Button>
        <a
          href={image.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          {t('messages.openOriginal')}
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>
      {state === 'failed' ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('messages.downloadFailed', { name: image.filename })}
        </p>
      ) : null}
    </Dialog>
  )
}
