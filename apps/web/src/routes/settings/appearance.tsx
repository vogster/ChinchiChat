import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SettingsSection } from '../../features/settings/settings-section'
import { ThemePicker } from '../../features/settings/theme-picker'

const AppearancePage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection
      title={t('settings.appearance.title')}
      subtitle={t('settings.appearance.subtitle')}
    >
      <ThemePicker />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/appearance')({ component: AppearancePage })
