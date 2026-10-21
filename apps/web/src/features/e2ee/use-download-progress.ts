import { useCallback, useState } from 'react'

import { sealedSize } from './file-crypto'

/** How much of a file's ciphertext has come down. */
export interface Progress {
  readonly received: number
  readonly total: number
}

export const percentOf = ({ received, total }: Progress) =>
  total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0

/**
 * Tracks a download of a sealed file of plain `size`; when the server gives no length, the
 * ciphertext's is known anyway. Re-renders only when the whole percent moves.
 */
export const useDownloadProgress = (size: number) => {
  const [progress, setProgress] = useState<Progress>({ received: 0, total: sealedSize(size) })
  const onProgress = useCallback(
    (received: number, total: number | null) => {
      const next = { received, total: total ?? sealedSize(size) }
      setProgress((previous) => (percentOf(previous) === percentOf(next) ? previous : next))
    },
    [size],
  )
  const reset = useCallback(() => setProgress({ received: 0, total: sealedSize(size) }), [size])
  return { progress, onProgress, reset }
}
