import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from './relative-time'

const NOW = new Date('2026-10-14T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe('formatRelativeTime', () => {
  it.each([
    [ago(10_000), 'ru', 'сейчас'],
    [ago(5 * 60_000), 'ru', '5 минут назад'],
    [ago(3 * 3_600_000), 'ru', '3 часа назад'],
    [ago(2 * 86_400_000), 'ru', 'позавчера'],
    [ago(40 * 86_400_000), 'ru', 'в прошлом месяце'],
    [ago(5 * 60_000), 'en', '5 minutes ago'],
    [ago(86_400_000), 'en', 'yesterday'],
  ])('formats %s in %s', (iso, language, expected) => {
    expect(formatRelativeTime(iso, language, NOW)).toBe(expected)
  })
})
