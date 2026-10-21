import { useEffect, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { useMediaBase } from './media-base'

import type { Download } from '@chinchi/sdk'

/** Object URLs already made for server files, so a list re-render does not fetch them again. */
const CACHE_LIMIT = 200
const cache = new Map<string, Promise<string>>()

const remember = (url: string, load: () => Promise<string>) => {
  const cached = cache.get(url)
  if (cached) return cached
  const pending = load().catch((error: unknown) => {
    cache.delete(url)
    throw error
  })
  cache.set(url, pending)
  if (cache.size > CACHE_LIMIT) {
    const [oldest, promise] = cache.entries().next().value as [string, Promise<string>]
    cache.delete(oldest)
    void promise.then(
      (objectUrl) => URL.revokeObjectURL(objectUrl),
      () => undefined,
    )
  }
  return pending
}

const loadObjectUrl = (download: Download, url: string) =>
  remember(url, async () => URL.createObjectURL(await download(url)))

/**
 * The address an `<img>` or player can show for a server file that needs the session. In a
 * browser tab that is the file's own path (the cookie goes along); in the desktop app the
 * page cannot send the token, so the bytes are fetched through the API and shown from a blob.
 * Null while the bytes are on their way or when they could not be had.
 */
export const useProtectedMedia = (url: string | null): string | null => {
  const api = useApi()
  const base = useMediaBase()
  const direct = base === null
  // Remembered together with its source, so a changed `url` shows nothing stale.
  const [made, setMade] = useState<{ url: string; objectUrl: string } | null>(null)

  useEffect(() => {
    if (direct || url === null) return undefined
    let current = true
    loadObjectUrl(api.media.download, url).then(
      (objectUrl) => current && setMade({ url, objectUrl }),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [api, direct, url])

  if (direct) return url
  return made !== null && made.url === url ? made.objectUrl : null
}
