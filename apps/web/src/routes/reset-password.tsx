import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { AuthCard } from '../features/auth/auth-card'
import { useLinkToken } from '../features/auth/use-link-token'
import { ResetPasswordForm } from '../features/auth/reset-password-form'

const ResetPasswordPage = () => {
  const { t } = useTranslation()
  const token = useLinkToken(Route.useSearch().token)
  return (
    <AuthCard title={t('auth.reset.title')}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  )
}

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
})
