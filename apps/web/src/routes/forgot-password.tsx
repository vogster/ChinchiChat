import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthCard } from '../features/auth/auth-card'
import { ForgotPasswordForm } from '../features/auth/forgot-password-form'

const ForgotPasswordPage = () => {
  const { t } = useTranslation()
  return (
    <AuthCard title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})
