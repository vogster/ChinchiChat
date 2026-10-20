import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthCard } from '../features/auth/auth-card'
import { ConfirmEmailStatus } from '../features/auth/confirm-email-status'
import { useLinkToken } from '../features/auth/use-link-token'

const ConfirmEmailPage = () => {
  const { t } = useTranslation()
  const token = useLinkToken(undefined)
  return (
    <AuthCard title={t('auth.confirmEmail.title')}>
      <ConfirmEmailStatus token={token} />
    </AuthCard>
  )
}

export const Route = createFileRoute('/confirm-email')({
  component: ConfirmEmailPage,
})
