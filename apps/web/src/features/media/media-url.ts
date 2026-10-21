/**
 * The server names its pictures and files by path (`/api/v1/avatars/…`): in a browser tab the
 * page lives on the server, so the path is enough. The desktop app's page lives on its own
 * origin, and the path has to be pointed at the chosen instance.
 */
export function resolveMediaUrl(base: string | null, url: string): string
export function resolveMediaUrl(base: string | null, url: string | null): string | null
export function resolveMediaUrl(base: string | null, url: string | null): string | null {
  if (url === null || base === null) return url
  if (!url.startsWith('/') || url.startsWith('//')) return url
  return `${base.replace(/\/+$/, '')}${url}`
}

/** `resolveMediaUrl` with the base filled in. */
export interface MediaResolver {
  (url: string): string
  (url: string | null): string | null
}

export const createMediaResolver = (base: string | null): MediaResolver => {
  function resolve(url: string): string
  function resolve(url: string | null): string | null
  function resolve(url: string | null): string | null {
    return resolveMediaUrl(base, url)
  }
  return resolve
}
