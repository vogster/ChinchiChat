import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { sessionsQueryOptions } from '../../features/auth/queries'
import { EncryptionDevices } from '../../features/settings/encryption-devices'
import { RecoveryKeySettings } from '../../features/settings/recovery-key-settings'
import { SessionsList } from '../../features/settings/sessions-list'
import { SettingsSection } from '../../features/settings/settings-section'

const SessionsPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection
      title={t('settings.sessions.title')}
      subtitle={t('settings.sessions.subtitle')}
    >
      <SessionsList />
    </SettingsSection>
  )
}

const SessionsAndKeysPage = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-12">
      <SessionsPage />
      <SettingsSection
        title={t('settings.encryptionDevices.title')}
        subtitle={t('settings.encryptionDevices.subtitle')}
      >
        <EncryptionDevices />
      </SettingsSection>
      <SettingsSection
        title={t('e2ee.recovery.enterTitle')}
        subtitle={t('e2ee.recovery.settingsHint')}
      >
        <RecoveryKeySettings />
      </SettingsSection>
    </div>
  )
}

export const Route = createFileRoute('/settings/sessions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQueryOptions(context.api)),
  component: SessionsAndKeysPage,
})
