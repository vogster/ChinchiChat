import { describe, expect, it } from 'vitest'

import en from '../locales/en.json'
import ru from '../locales/ru.json'

const keysOf = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) =>
        keysOf(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix]

// Languages need different plural forms (ru: one/few/many, en: one/other), so compare base keys.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const baseKeysOf = (locale: unknown) =>
  [...new Set(keysOf(locale).map((key) => key.replace(PLURAL_SUFFIX, '')))].sort()

describe('locales', () => {
  it('ru and en define the same keys (ignoring plural forms)', () => {
    expect(baseKeysOf(en)).toEqual(baseKeysOf(ru))
  })

  it('every pluralized key has the forms its language needs', () => {
    const forms = (locale: unknown, base: string) =>
      keysOf(locale)
        .filter((key) => key.replace(PLURAL_SUFFIX, '') === base && PLURAL_SUFFIX.test(key))
        .map((key) => key.match(PLURAL_SUFFIX)?.[1])
        .sort()
    const pluralBases = keysOf(ru)
      .filter((key) => PLURAL_SUFFIX.test(key))
      .map((key) => key.replace(PLURAL_SUFFIX, ''))

    for (const base of new Set(pluralBases)) {
      expect(forms(ru, base)).toEqual(['few', 'many', 'one', 'other'])
      expect(forms(en, base)).toEqual(['one', 'other'])
    }
  })

  it('has no empty translations', () => {
    const empty = [ru, en].flatMap((locale) =>
      keysOf(locale).filter((key) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], locale)
        return typeof value !== 'string' || value.trim() === ''
      }),
    )
    expect(empty).toEqual([])
  })
})
