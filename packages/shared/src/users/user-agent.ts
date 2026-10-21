// Order matters: Edge and Opera also contain "Chrome", Chrome also contains "Safari".
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
]

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

const firstMatch = (value: string, table: readonly (readonly [RegExp, string])[]) =>
  table.find(([pattern]) => pattern.test(value))?.[1]

/** Short human label for a session's User-Agent, e.g. "Chrome · macOS"; null when unknown. */
export const describeUserAgent = (userAgent: string | null): string | null => {
  const value = userAgent?.trim()
  if (!value) return null

  const browser = firstMatch(value, BROWSERS)
  const system = firstMatch(value, SYSTEMS)
  if (browser && system) return `${browser} · ${system}`

  // Native clients and tools: "Chinchi Desktop/1.0" → "Chinchi Desktop".
  return browser ?? system ?? value.split('/')[0]?.trim() ?? null
}
