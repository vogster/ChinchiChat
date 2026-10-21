import { useEffect, useRef, useState } from 'react'

import { useDownloadProgress } from './use-download-progress'

import type { DownloadOptions } from '@chinchi/sdk'

export type DownloadState = 'idle' | 'loading' | 'failed'

export interface CancellableDownloadOptions {
  /** What comes down, when the server does not say. */
  readonly expectedBytes: number
  /** The bytes to save; rejects once cancelled. */
  readonly load: (options: DownloadOptions) => Promise<Blob>
  readonly save: (blob: Blob) => Promise<void>
  /** The trigger replaces something that had the focus: it takes the focus when it shows. */
  readonly autoFocus?: boolean
}

/**
 * A file fetched on a click and handed over, with how far it got and a way to stop it. While
 * it runs, a progress card stands where the trigger was; the focus goes back to the trigger if
 * it was on the card. A run that was cancelled may still settle later (decrypting cannot stop
 * midway): it is ignored. Leaving the page stops the download.
 */
export const useCancellableDownload = <T extends HTMLElement>({
  expectedBytes,
  load,
  save,
  autoFocus = false,
}: CancellableDownloadOptions) => {
  const [state, setState] = useState<DownloadState>('idle')
  const { progress, onProgress, reset } = useDownloadProgress(expectedBytes)
  const abort = useRef<AbortController | null>(null)
  const trigger = useRef<T>(null)
  const progressBox = useRef<HTMLDivElement>(null)
  const refocus = useRef(autoFocus)

  useEffect(() => () => abort.current?.abort(), [])

  useEffect(() => {
    if (state === 'loading' || !refocus.current) return
    refocus.current = false
    trigger.current?.focus()
  }, [state])

  const settle = (next: Exclude<DownloadState, 'loading'>) => {
    refocus.current = progressBox.current?.contains(document.activeElement) ?? false
    setState(next)
  }

  const start = async () => {
    const controller = new AbortController()
    abort.current = controller
    reset()
    setState('loading')
    try {
      const blob = await load({ signal: controller.signal, onProgress })
      if (abort.current !== controller) return
      await save(blob)
      if (abort.current === controller) settle('idle')
    } catch {
      if (abort.current === controller) settle('failed')
    }
  }

  const cancel = () => {
    abort.current?.abort()
    abort.current = null
    settle('idle')
  }

  return { state, progress, start, cancel, trigger, progressBox }
}
