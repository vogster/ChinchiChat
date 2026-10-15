import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useCurrentUser } from '../../features/auth/use-auth-actions'
import { ProfileForm } from '../../features/settings/profile-form'
import { SettingsCard, SettingsSection } from '../../features/settings/settings-section'

const ProfilePage = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  if (!user) return null

  return (
    <SettingsSection title={t('settings.profile.title')}>
      <SettingsCard>
        <ProfileForm user={user} />
      </SettingsCard>
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/profile')({ component: ProfilePage })
