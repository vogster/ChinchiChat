import { useCallback } from 'react'

import { saveBlob } from '../../lib/save-file'
import { useShell } from './shell-context'

/** Hands bytes over as a file under the given name. */
export type SaveFile = (name: string, blob: Blob) => Promise<void>

/**
 * How this page saves a file: a browser tab lets the browser download it, the desktop app asks
 * where to put it ("Save as") through the shell, because its webview has no downloads of its
 * own on every platform. Cancelling the dialog is not an error.
 */
export const useSaveFile = (): SaveFile => {
  const shell = useShell()
  return useCallback<SaveFile>(
    async (name, blob) => {
      if (shell) {
        await shell.saveFile(name, blob)
        return
      }
      saveBlob(name, blob)
    },
    [shell],
  )
}
