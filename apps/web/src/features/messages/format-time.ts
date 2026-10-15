const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar day in the viewer's time zone, e.g. "2026-10-14". */
export const localDay = (iso: string): string => {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const formatShortTime = (iso: string, language: string): string =>
  new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))

const RELATIVE_DAY: Readonly<Record<string, { today: string; yesterday: string }>> = {
  ru: { today: 'Сегодня в', yesterday: 'Вчера в' },
  en: { today: 'Today at', yesterday: 'Yesterday at' },
}

/** "Сегодня в 14:05", "Вчера в 21:30", or a full date for anything older. */
export const formatMessageTime = (iso: string, language: string, now = new Date()): string => {
  const day = localDay(iso)
  const today = localDay(now.toISOString())
  const yesterday = localDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString(),
  )
  const words = RELATIVE_DAY[language] ?? RELATIVE_DAY.en
  const time = formatShortTime(iso, language)

  if (day === today) return `${words?.today} ${time}`
  if (day === yesterday) return `${words?.yesterday} ${time}`
  const date = new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
  return `${date} ${time}`
}

/** Day separator label: "14 октября 2026 г." / "October 14, 2026". */
export const formatDay = (day: string, language: string): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year as number, (month as number) - 1, date))
}
