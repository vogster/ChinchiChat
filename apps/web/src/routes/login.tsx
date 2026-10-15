import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { AuthCard } from '../features/auth/auth-card'
import { redirectIfSignedIn } from '../features/auth/guest-only'
import { LoginForm } from '../features/auth/login-form'

const LoginPage = () => {
  const { t } = useTranslation()
  const { redirect } = Route.useSearch()

  return (
    <AuthCard title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <LoginForm redirectTo={redirect} />
    </AuthCard>
  )
}

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context, search.redirect),
  component: LoginPage,
})
