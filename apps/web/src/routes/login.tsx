import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { AuthCard } from '../features/auth/auth-card'
import { redirectIfSignedIn } from '../features/auth/guest-only'
import { LoginForm } from '../features/auth/login-form'
import { QrLoginPanel } from '../features/auth/qr-login-panel'
import { useMediaQuery } from '../lib/use-media-query'

const LoginPage = () => {
  const { t } = useTranslation()
  const { redirect } = Route.useSearch()
  // A phone is the device that scans: there the QR waits behind a button instead.
  const wide = useMediaQuery('(min-width: 768px)')

  return (
    <AuthCard
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      aside={wide ? <QrLoginPanel redirectTo={redirect} /> : undefined}
    >
      <LoginForm redirectTo={redirect} qrBeside={wide} />
    </AuthCard>
  )
}

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context, search.redirect),
  component: LoginPage,
})
