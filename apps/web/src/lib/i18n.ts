import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from '../locales/en.json'
import ru from '../locales/ru.json'

export const SUPPORTED_LANGUAGES = ['ru', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const resources = { ru: { translation: ru }, en: { translation: en } } as const

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof ru }
  }
}

/** Initializes i18next once. Tests pass a fixed language to skip browser detection. */
export const initI18n = (language?: Language) => {
  if (i18n.isInitialized) {
    if (language && i18n.language !== language) void i18n.changeLanguage(language)
    return i18n
  }

  // Keep <html lang> in sync for screen readers, hyphenation and spellcheck.
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })

  const instance = language ? i18n : i18n.use(LanguageDetector)
  void instance.use(initReactI18next).init({
    resources,
    ...(language ? { lng: language } : {}),
    fallbackLng: 'ru',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'chinchi.lang' },
    returnNull: false,
  })
  return i18n
}
