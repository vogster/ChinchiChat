import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../components/ui/alert'
import { AuthCard } from '../features/auth/auth-card'
import { redirectIfSignedIn } from '../features/auth/guest-only'
import { instanceQueryOptions } from '../features/auth/queries'
import { RegisterForm } from '../features/auth/register-form'
import { useApi } from '../lib/api-context'

const RegisterPage = () => {
  const { t } = useTranslation()
  const { data: instance } = useSuspenseQuery(instanceQueryOptions(useApi()))
  const { redirect, invite } = Route.useSearch()

  return (
    <AuthCard title={t('auth.register.title')}>
      {instance.registrationMode === 'closed' ? (
        <div className="flex flex-col gap-4">
          <Alert tone="info">{t('auth.register.closed')}</Alert>
          <Link to="/login" className="text-sm font-medium text-accent hover:underline">
            {t('common.backToLogin')}
          </Link>
        </div>
      ) : (
        <RegisterForm
          redirectTo={redirect}
          inviteRequired={instance.registrationMode === 'invite'}
          inviteCode={invite}
        />
      )}
    </AuthCard>
  )
}

export const Route = createFileRoute('/register')({
  validateSearch: z.object({ redirect: z.string().optional(), invite: z.string().optional() }),
  beforeLoad: ({ context, search }) => redirectIfSignedIn(context, search.redirect),
  loader: ({ context }) => context.queryClient.ensureQueryData(instanceQueryOptions(context.api)),
  component: RegisterPage,
})
