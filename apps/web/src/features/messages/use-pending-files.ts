import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { instanceQueryOptions } from '../auth/queries'
import { formatFileSize } from './format-size'

export interface PendingFile {
  readonly id: string
  readonly file: File
}

/** Files picked for the next message, checked against the instance limits as they are added. */
export const usePendingFiles = () => {
  const { t, i18n } = useTranslation()
  const { data: instance } = useQuery(instanceQueryOptions(useApi()))
  const [files, setFiles] = useState<readonly PendingFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const limits = instance?.uploads ?? null

  const add = (picked: readonly File[]) => {
    if (!limits || picked.length === 0) return
    const tooLarge = picked.find((file) => file.size > limits.maxBytes)
    const fitting = picked.filter((file) => file.size <= limits.maxBytes)
    const room = limits.maxAttachments - files.length
    const accepted = fitting.slice(0, Math.max(0, room))
    const added = accepted.map((file) => ({ id: crypto.randomUUID(), file }))
    // Functional update: a drop and a paste in the same tick must not overwrite each other.
    setFiles((current) => [...current, ...added].slice(0, limits.maxAttachments))
    if (tooLarge) {
      setError(
        t('messages.fileTooLarge', {
          name: tooLarge.name,
          limit: formatFileSize(limits.maxBytes, i18n.language),
        }),
      )
    } else if (accepted.length < fitting.length) {
      setError(t('messages.tooManyFiles', { count: limits.maxAttachments }))
    } else {
      setError(null)
    }
  }

  return {
    files,
    error,
    /** Uploads are possible on this instance at all. */
    enabled: limits !== null,
    add,
    remove: (id: string) => setFiles((current) => current.filter((pending) => pending.id !== id)),
    clear: () => {
      setFiles([])
      setError(null)
    },
  }
}

export type PendingFiles = ReturnType<typeof usePendingFiles>
