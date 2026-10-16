/** A path segment from user data (ids, codes, emoji). */
export const id = (value: string) => encodeURIComponent(value)

/** `?a=1&b=2` from an object, skipping what is unset or empty; '' when nothing is. */
export const queryString = (query: Record<string, unknown>): string => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
