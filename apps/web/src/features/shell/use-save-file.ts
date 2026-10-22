import { safeFileName } from '@chinchi/shared'
import { useCallback } from 'react'

import { saveBlob } from '../../lib/save-file'
import { useShell } from './shell-context'

/** Hands bytes over as a file under the given name. */
export type SaveFile = (name: string, blob: Blob) => Promise<void>

/**
 * How this page saves a file: a browser tab lets the browser download it, the desktop app asks
 * where to put it ("Save as") through the shell, because its webview has no downloads of its
 * own on every platform. Cancelling the dialog is not an error. The name is offered only as a
 * plain file name: one with a path would open the dialog wherever it pointed.
 */
export const useSaveFile = (): SaveFile => {
  const shell = useShell()
  return useCallback<SaveFile>(
    async (name, blob) => {
      const safe = safeFileName(name)
      if (shell) {
        await shell.saveFile(safe, blob)
        return
      }
      saveBlob(safe, blob)
    },
    [shell],
  )
}
