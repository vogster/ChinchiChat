import { Download, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { useMediaUrl } from '../media/media-base'
import { useProtectedMedia } from '../media/use-protected-media'
import { useSaveFile } from '../shell/use-save-file'

import type { SaveFile } from '../shell/use-save-file'
import type { Download as DownloadFile } from '@chinchi/sdk'
import type { Attachment } from '@chinchi/shared'

export interface ImageViewerProps {
  readonly image: Attachment
  readonly onOpenChange: (open: boolean) => void
}

/**
 * Fetched rather than a plain `<a download>`: images are served inline from the file domain,
 * and browsers ignore `download` on another origin.
 */
const downloadImage = async (download: DownloadFile, save: SaveFile, image: Attachment) =>
  save(image.filename, await download(image.url))

/** The original image, as large as the window allows; Escape or the close button closes it. */
export const ImageViewer = ({ image, onOpenChange }: ImageViewerProps) => {
  const { t } = useTranslation()
  const api = useApi()
  const save = useSaveFile()
  const media = useMediaUrl()
  const src = useProtectedMedia(image.url)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')

  const download = async () => {
    setState('loading')
    try {
      await downloadImage(api.media.download, save, image)
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange} title={image.filename} size="lg">
      <img
        src={src ?? undefined}
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
          href={media(image.url)}
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
