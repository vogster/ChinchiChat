import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { AuthCard } from '../features/auth/auth-card'
import { useLinkToken } from '../features/auth/use-link-token'
import { VerifyEmailStatus } from '../features/auth/verify-email-status'

const VerifyEmailPage = () => {
  const { t } = useTranslation()
  const token = useLinkToken(Route.useSearch().token)
  return (
    <AuthCard title={t('auth.verify.title')}>
      <VerifyEmailStatus token={token} />
    </AuthCard>
  )
}

export const Route = createFileRoute('/verify-email')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: VerifyEmailPage,
})
