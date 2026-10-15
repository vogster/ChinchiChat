const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/** "5 минут назад", "yesterday", ... in the given UI language. */
export const formatRelativeTime = (iso: string, language: string, now = new Date()): string => {
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  const elapsed = new Date(iso).getTime() - now.getTime()

  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size) return format.format(Math.round(elapsed / size), unit)
  }
  return format.format(0, 'second')
}
