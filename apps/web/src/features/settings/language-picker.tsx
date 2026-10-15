import { useTranslation } from 'react-i18next'

import { SUPPORTED_LANGUAGES } from '../../lib/i18n'

const LABELS: Readonly<Record<(typeof SUPPORTED_LANGUAGES)[number], string>> = {
  ru: 'Русский',
  en: 'English',
}

export const LanguagePicker = () => {
  const { t, i18n } = useTranslation()
  const current = i18n.resolvedLanguage ?? 'ru'

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t('settings.language.title')}</legend>
      {SUPPORTED_LANGUAGES.map((language) => (
        <label
          key={language}
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-sidebar px-4 py-3 hover:bg-hover has-[:checked]:outline-2 has-[:checked]:outline-accent"
        >
          <input
            type="radio"
            name="language"
            value={language}
            checked={current === language}
            onChange={() => void i18n.changeLanguage(language)}
            className="size-4 accent-[var(--zl-accent)]"
          />
          <span lang={language}>{LABELS[language]}</span>
        </label>
      ))}
    </fieldset>
  )
}
