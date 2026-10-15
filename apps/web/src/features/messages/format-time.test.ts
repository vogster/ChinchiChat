import { describe, expect, it } from 'vitest'

import { formatDay, formatMessageTime, formatShortTime, localDay } from './format-time'

// Local-time constructors keep the tests independent of the machine's time zone.
const NOW = new Date(2026, 9, 14, 15, 0)
const at = (day: number, hours: number, minutes: number) =>
  new Date(2026, 9, day, hours, minutes).toISOString()

describe('message time formatting', () => {
  it.each([
    [at(14, 9, 5), 'ru', 'Сегодня в 09:05'],
    [at(13, 21, 30), 'ru', 'Вчера в 21:30'],
    [at(14, 9, 5), 'en', 'Today at 09:05'],
    [at(13, 21, 30), 'en', 'Yesterday at 21:30'],
  ])('%s in %s → %s', (iso, language, expected) => {
    expect(formatMessageTime(iso, language, NOW)).toBe(expected)
  })

  it('shows the full date for older messages', () => {
    expect(formatMessageTime(at(1, 8, 0), 'ru', NOW)).toBe('01.10.2026 08:00')
  })

  it('formats compact times and day separators', () => {
    expect(formatShortTime(at(14, 9, 5), 'ru')).toBe('09:05')
    expect(formatDay('2026-10-14', 'ru')).toBe('14 октября 2026 г.')
    expect(formatDay('2026-10-14', 'en')).toBe('October 14, 2026')
  })

  it('computes the local calendar day', () => {
    expect(localDay(at(14, 0, 30))).toBe('2026-10-14')
  })
})
