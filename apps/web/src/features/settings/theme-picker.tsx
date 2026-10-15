import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { readTheme, setTheme } from '../../lib/theme'

import type { ThemeChoice } from '../../lib/theme'

const CHOICES: readonly ThemeChoice[] = ['system', 'dark', 'light']

export const ThemePicker = () => {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(readTheme)

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t('settings.appearance.theme')}</legend>
      {CHOICES.map((choice) => (
        <label
          key={choice}
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-sidebar px-4 py-3 hover:bg-hover has-[:checked]:outline-2 has-[:checked]:outline-accent"
        >
          <input
            type="radio"
            name="theme"
            value={choice}
            checked={current === choice}
            onChange={() => {
              setTheme(choice)
              setCurrent(choice)
            }}
            className="size-4 accent-[var(--zl-accent)]"
          />
          <span>{t(`settings.appearance.${choice}`)}</span>
        </label>
      ))}
    </fieldset>
  )
}
