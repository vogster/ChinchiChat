const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The origin of a Chinchi instance from whatever someone typed: a bare host gets https,
 * paths and queries are dropped. Plain http is for local development only; anything with
 * credentials or another scheme is not an address we connect to.
 */
export const normalizeInstanceUrl = (input: string): string | null => {
  const text = input.trim()
  if (text.length === 0) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) return null
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!url.hostname.includes('.') && !LOCAL_HOSTS.has(url.hostname)) return null
  return url.origin
}
