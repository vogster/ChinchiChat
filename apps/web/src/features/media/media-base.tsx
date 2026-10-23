import { createContext, useContext, useMemo } from 'react'

import { createMediaResolver } from './media-url'

import type { MediaResolver } from './media-url'
import type { ReactNode } from 'react'

const MediaBaseContext = createContext<string | null>(null)

/** Where the server's pictures and files live when the page does not: the desktop's instance. */
export const MediaBaseProvider = ({
  base,
  children,
}: {
  base: string | null
  children: ReactNode
}) => <MediaBaseContext.Provider value={base}>{children}</MediaBaseContext.Provider>

/** The instance the server's files live on, or null when the page itself lives there. */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useMediaBase = (): string | null => useContext(MediaBaseContext)

/**
 * Where links meant for other people point (invites): the instance, which in the desktop app is
 * not the page's own address (`tauri.localhost`).
 */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const usePublicOrigin = (): string => useContext(MediaBaseContext) ?? window.location.origin

/** Turns a server path (`/api/v1/avatars/…`) into something an `<img>` can load from here. */
// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export const useMediaUrl = (): MediaResolver => {
  const base = useContext(MediaBaseContext)
  return useMemo(() => createMediaResolver(base), [base])
}
