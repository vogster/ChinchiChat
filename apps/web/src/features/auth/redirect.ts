const BASE = 'https://app.invalid'

/**
 * Only same-app paths are allowed as post-login destinations, so a crafted
 * `/login?redirect=https://evil.example` cannot bounce users to another site. The target is
 * resolved the way a browser would (tabs and newlines dropped, so `/<tab>/evil` is `//evil`)
 * and must stay on this origin.
 */
export const safeRedirect = (target: string | undefined): string => {
  if (!target || !target.startsWith('/')) return '/'
  const cleaned = target.replace(/[\t\n\r]/g, '')
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\') || /^\/%(09|0a|0d)/i.test(cleaned)) {
    return '/'
  }
  try {
    const url = new URL(cleaned, BASE)
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}
