import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from './queries'

/**
 * Tokens are single-use, so verification runs as a deduplicated query rather than an effect:
 * React StrictMode's double-invoked effects would otherwise burn the token on the first call.
 */
export const VerifyEmailStatus = ({ token }: { token: string | undefined }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()

  const verification = useQuery({
    queryKey: ['verify-email', token],
    queryFn: async () => {
      const { user } = await api.auth.verifyEmail(token ?? '')
      queryClient.setQueryData(authKeys.me, (current: unknown) => (current ? user : current))
      return user
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  if (!token) return <Alert tone="error">{t('errors.INVALID_TOKEN')}</Alert>
  if (verification.isPending)
    return <p className="text-center text-muted">{t('auth.verify.pending')}</p>
  if (verification.isError) return <Alert tone="error">{errorMessage(t, verification.error)}</Alert>

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success">{t('auth.verify.done')}</Alert>
      <Link
        to="/"
        className="rounded-md bg-accent px-4 py-2.5 text-center font-medium text-accent-contrast hover:opacity-90"
      >
        {t('auth.verify.continue')}
      </Link>
    </div>
  )
}
