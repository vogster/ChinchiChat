import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SettingsSection } from '../../features/settings/settings-section'
import { VoiceDevices } from '../../features/settings/voice-devices'

const VoicePage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.voice.title')} subtitle={t('settings.voice.subtitle')}>
      <VoiceDevices />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/voice')({ component: VoicePage })
