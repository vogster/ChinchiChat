import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DesktopNotifications } from '../../features/settings/desktop-notifications'
import { SettingsSection } from '../../features/settings/settings-section'

const NotificationsPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection
      title={t('notifications.desktop.title')}
      subtitle={t('notifications.desktop.subtitle')}
    >
      <DesktopNotifications />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/notifications')({ component: NotificationsPage })
