import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { LanguagePicker } from '../../features/settings/language-picker'
import { SettingsSection } from '../../features/settings/settings-section'

const LanguagePage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection
      title={t('settings.language.title')}
      subtitle={t('settings.language.subtitle')}
    >
      <LanguagePicker />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/language')({ component: LanguagePage })
