import { useCallback, useState } from 'react'

/** How much of a file has come down. */
export interface Progress {
  readonly received: number
  readonly total: number
}

export const percentOf = ({ received, total }: Progress) =>
  total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0

/**
 * Tracks a download of `expectedBytes`, the total when the server gives no length. Re-renders
 * only when the whole percent moves.
 */
export const useDownloadProgress = (expectedBytes: number) => {
  const [progress, setProgress] = useState<Progress>({ received: 0, total: expectedBytes })
  const onProgress = useCallback(
    (received: number, total: number | null) => {
      const next = { received, total: total ?? expectedBytes }
      setProgress((previous) => (percentOf(previous) === percentOf(next) ? previous : next))
    },
    [expectedBytes],
  )
  const reset = useCallback(
    () => setProgress({ received: 0, total: expectedBytes }),
    [expectedBytes],
  )
  return { progress, onProgress, reset }
}
