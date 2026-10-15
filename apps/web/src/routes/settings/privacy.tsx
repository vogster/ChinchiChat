import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DmPolicyPicker } from '../../features/settings/dm-policy-picker'
import { SettingsSection } from '../../features/settings/settings-section'

const PrivacyPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.privacy.title')}>
      <DmPolicyPicker />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/privacy')({ component: PrivacyPage })
