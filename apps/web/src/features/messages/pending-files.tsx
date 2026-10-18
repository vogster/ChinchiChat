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
    <ul aria-label={t('messages.pendingFiles')} className="flex flex-wrap gap-2 px-4 pt-2 pb-1">
      {files.map(({ id, file }) => (
        <li
          key={id}
          className="flex max-w-60 items-center gap-2.5 rounded-[18px] bg-field py-1.5 pr-1.5 pl-1.5 text-sm"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"
          >
            <FileText className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate">{file.name}</span>
            <span className="block text-xs text-faint">
              {formatFileSize(file.size, i18n.language)}
            </span>
          </span>
          <button
            type="button"
            aria-label={t('messages.removeFile', { name: file.name })}
            onClick={() => onRemove(id)}
            className="grid size-7 shrink-0 place-items-center rounded-full text-muted hover:bg-stage hover:text-text"
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  )
}
