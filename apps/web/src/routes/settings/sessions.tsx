import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { sessionsQueryOptions } from '../../features/auth/queries'
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

export const Route = createFileRoute('/settings/sessions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(sessionsQueryOptions(context.api)),
  component: SessionsPage,
})
