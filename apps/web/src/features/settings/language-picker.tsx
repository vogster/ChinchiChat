import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { SUPPORTED_LANGUAGES } from '../../lib/i18n'
import { authKeys } from '../auth/queries'

import type { Language } from '../../lib/i18n'

const LABELS: Readonly<Record<(typeof SUPPORTED_LANGUAGES)[number], string>> = {
  ru: 'Русский',
  en: 'English',
}

/** The app's language on this device; emails to the account follow the latest choice. */
export const LanguagePicker = () => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const current = i18n.resolvedLanguage ?? 'ru'
  const saveLocale = useMutation({
    mutationFn: (locale: Language) => api.users.updateMe({ locale }),
    onSuccess: ({ user }) => queryClient.setQueryData(authKeys.me, user),
  })
  const pick = (language: Language) => {
    void i18n.changeLanguage(language)
    saveLocale.mutate(language)
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t('settings.language.title')}</legend>
      {SUPPORTED_LANGUAGES.map((language) => (
        <label
          key={language}
          className="flex cursor-pointer items-center gap-3 rounded-lg bg-side px-4 py-3 hover:bg-chip has-[:checked]:outline-2 has-[:checked]:outline-accent"
        >
          <input
            type="radio"
            name="language"
            value={language}
            checked={current === language}
            onChange={() => pick(language)}
            className="size-4 accent-[var(--zl-accent)]"
          />
          <span lang={language}>{LABELS[language]}</span>
        </label>
      ))}
    </fieldset>
  )
}
