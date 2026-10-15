import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useCurrentUser } from '../../features/auth/use-auth-actions'
import { ChangePasswordForm } from '../../features/settings/change-password-form'
import { DataExport } from '../../features/settings/data-export'
import { DeleteAccount } from '../../features/settings/delete-account'
import { MfaSettings } from '../../features/settings/mfa-settings'
import { SettingsCard, SettingsSection } from '../../features/settings/settings-section'

const AccountPage = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  if (!user) return null

  return (
    <SettingsSection title={t('settings.account.title')}>
      <SettingsCard>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('settings.account.username')}
            </dt>
            <dd className="mt-1">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('settings.account.email')}
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="break-all">{user.email}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${user.emailVerified ? 'bg-green-600 text-white' : 'bg-yellow-500 text-black'}`}
              >
                {user.emailVerified
                  ? t('settings.account.verified')
                  : t('settings.account.unverified')}
              </span>
            </dd>
          </div>
        </dl>
      </SettingsCard>

      <SettingsCard title={t('settings.account.passwordTitle')}>
        <ChangePasswordForm />
      </SettingsCard>

      <SettingsCard title={t('settings.mfa.title')}>
        <MfaSettings enabled={user.mfaEnabled} />
      </SettingsCard>

      <DataExport />

      <DeleteAccount />
    </SettingsSection>
  )
}

export const Route = createFileRoute('/settings/account')({ component: AccountPage })
