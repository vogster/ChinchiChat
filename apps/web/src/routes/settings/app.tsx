import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AppSettings } from '../../features/settings/app-settings'
import { SettingsSection } from '../../features/settings/settings-section'

/** Only the desktop app has these settings; the browser never links here. */
const AppPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.app.title')} subtitle={t('settings.app.subtitle')}>
      <AppSettings />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/app')({ component: AppPage })
