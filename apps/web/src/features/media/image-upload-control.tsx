import { PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_TYPES } from '@chinchi/shared'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { useUploadsEnabled } from './use-uploads-enabled'

export interface ImageUploadControlProps {
  readonly uploadLabel: string
  readonly removeLabel: string
  readonly hasImage: boolean
  readonly pending: boolean
  readonly error: unknown
  readonly onSelect: (file: File) => void
  readonly onRemove: () => void
}

/** Pick or remove an avatar / server icon. Hidden when the instance has no file storage. */
export const ImageUploadControl = ({
  uploadLabel,
  removeLabel,
  hasImage,
  pending,
  error,
  onSelect,
  onRemove,
}: ImageUploadControlProps) => {
  const { t } = useTranslation()
  const enabled = useUploadsEnabled()
  const inputId = useId()
  const [tooLarge, setTooLarge] = useState(false)
  if (!enabled) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          aria-disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-[disabled=false]:cursor-pointer aria-[disabled=false]:hover:opacity-90"
        >
          {uploadLabel}
          <input
            id={inputId}
            type="file"
            accept={PROFILE_IMAGE_TYPES.join(',')}
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Let the same file be picked again after an error.
              event.target.value = ''
              if (!file) return
              const over = file.size > PROFILE_IMAGE_MAX_BYTES
              setTooLarge(over)
              if (!over) onSelect(file)
            }}
          />
        </label>
        {hasImage ? (
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            onClick={onRemove}
            disabled={pending}
          >
            {removeLabel}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted">{t('media.hint')}</p>
      {tooLarge ? <Alert tone="error">{t('media.tooLarge')}</Alert> : null}
      {!tooLarge && error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
    </div>
  )
}
