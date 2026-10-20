import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useCurrentUser } from '../auth/use-auth-actions'
import { AppSettings } from './app-settings'
import { ChangeEmailDialog } from './change-email-dialog'
import { ChangePasswordForm } from './change-password-form'
import { DataExport } from './data-export'
import { DeleteAccount } from './delete-account'
import { DesktopNotifications } from './desktop-notifications'
import { DmPolicyPicker } from './dm-policy-picker'
import { EncryptionDevices } from './encryption-devices'
import { LanguagePicker } from './language-picker'
import { MfaSettings } from './mfa-settings'
import { ProfileForm } from './profile-form'
import { RecoveryKeySettings } from './recovery-key-settings'
import { SessionsList } from './sessions-list'
import { SettingsRow } from './settings-row'
import { SettingsCard, SettingsSection } from './settings-section'
import { SignInOtherDevice } from './sign-in-other-device'
import { DensityPicker, PalettePicker, ThemePicker } from './theme-picker'
import { VoiceDevices } from './voice-devices'

export const AccountPage = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const [changingEmail, setChangingEmail] = useState(false)
  if (!user) return null

  return (
    <SettingsSection title={t('settings.account.title')}>
      <SettingsCard title={t('settings.account.credentials')}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[12.5px] text-faint">{t('settings.account.username')}</dt>
            <dd className="mt-1">{user.username}</dd>
          </div>
          <div>
            <dt className="text-[12.5px] text-faint">{t('settings.account.email')}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <span className="break-all">{user.email}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${user.emailVerified ? 'bg-secure-soft text-secure-text' : 'bg-warning-soft text-warning-text'}`}
              >
                {user.emailVerified
                  ? t('settings.account.verified')
                  : t('settings.account.unverified')}
              </span>
              <Button variant="link" onClick={() => setChangingEmail(true)}>
                {t('settings.changeEmail.open')}
              </Button>
            </dd>
          </div>
        </dl>
        {changingEmail ? <ChangeEmailDialog onOpenChange={setChangingEmail} /> : null}
      </SettingsCard>

      <SettingsCard title={t('settings.account.security')}>
        <SettingsRow title={t('settings.account.password')} value={t('settings.account.change')}>
          <ChangePasswordForm />
        </SettingsRow>
        <SettingsRow
          title={t('settings.mfa.title')}
          value={
            <span className={user.mfaEnabled ? 'text-secure-text' : 'text-muted'}>
              {user.mfaEnabled ? t('settings.mfa.on') : t('settings.mfa.off')}
            </span>
          }
        >
          <MfaSettings enabled={user.mfaEnabled} />
        </SettingsRow>
      </SettingsCard>

      <DataExport />

      <DeleteAccount />
    </SettingsSection>
  )
}

export const ProfilePage = () => {
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

export const PrivacyPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.privacy.title')}>
      <DmPolicyPicker />
    </SettingsSection>
  )
}

export const NotificationsPage = () => {
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

export const VoicePage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.voice.title')} subtitle={t('settings.voice.subtitle')}>
      <VoiceDevices />
    </SettingsSection>
  )
}

export const SessionsPage = () => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-12">
      <SettingsSection
        title={t('settings.sessions.title')}
        subtitle={t('settings.sessions.subtitle')}
      >
        <SessionsList />
      </SettingsSection>
      <SettingsSection
        title={t('settings.qrSignIn.title')}
        subtitle={t('settings.qrSignIn.subtitle')}
      >
        <SignInOtherDevice />
      </SettingsSection>
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

export const AppearancePage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection
      title={t('settings.appearance.title')}
      subtitle={t('settings.appearance.subtitle')}
    >
      <div className="flex flex-col gap-6">
        <ThemePicker />
        <PalettePicker />
        <DensityPicker />
      </div>
    </SettingsSection>
  )
}

export const LanguagePage = () => {
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

/** Only the desktop app has these settings; the browser never links here. */
export const AppPage = () => {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('settings.app.title')} subtitle={t('settings.app.subtitle')}>
      <AppSettings />
    </SettingsSection>
  )
}
