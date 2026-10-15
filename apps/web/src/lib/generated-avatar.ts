import { Avatar, Style } from '@dicebear/core'
import blobs from '@dicebear/styles/blobs.json'
import clay from '@dicebear/styles/clay.json'

/**
 * Pictures for people and servers without one, drawn locally by DiceBear (no requests to its
 * API): "Clay" creatures for people, "Blobs" behind a server's initials. Both styles are CC0.
 * The same id always gives the same picture; each is drawn once and kept.
 */
const STYLES = { user: new Style(clay), guild: new Style(blobs) } as const
const CACHE_LIMIT = 500
const cache = new Map<string, string>()

export type GeneratedAvatarKind = keyof typeof STYLES

export const generatedAvatar = (kind: GeneratedAvatarKind, id: string): string => {
  const key = `${kind}:${id}`
  const cached = cache.get(key)
  if (cached) return cached
  const uri = new Avatar(STYLES[kind], { seed: id }).toDataUri()
  // Oldest out first: a long session meets many people, the page needs only the recent ones.
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, uri)
  return uri
}
