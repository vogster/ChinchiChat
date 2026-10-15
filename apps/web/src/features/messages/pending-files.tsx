import { FileText, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatFileSize } from './format-size'

import type { PendingFile } from './use-pending-files'

export interface PendingFilesListProps {
  readonly files: readonly PendingFile[]
  readonly onRemove: (id: string) => void
}

/** Files waiting above the composer until the message is sent. */
export const PendingFilesList = ({ files, onRemove }: PendingFilesListProps) => {
  const { t, i18n } = useTranslation()
  if (files.length === 0) return null
  return (
    <ul aria-label={t('messages.pendingFiles')} className="flex flex-wrap gap-2 px-4 pt-2">
      {files.map(({ id, file }) => (
        <li
          key={id}
          className="flex max-w-56 items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-sm"
        >
          <FileText aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block truncate">{file.name}</span>
            <span className="block text-xs text-muted">
              {formatFileSize(file.size, i18n.language)}
            </span>
          </span>
          <button
            type="button"
            aria-label={t('messages.removeFile', { name: file.name })}
            onClick={() => onRemove(id)}
            className="rounded p-0.5 text-muted hover:text-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
