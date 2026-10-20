import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from './queries'

/** The link from the new address; a query, not an effect, so StrictMode doesn't spend it twice. */
export const ConfirmEmailStatus = ({ token }: { token: string | undefined }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()

  const confirmation = useQuery({
    queryKey: ['confirm-email', token],
    queryFn: async () => {
      const { user } = await api.auth.confirmEmailChange(token ?? '')
      queryClient.setQueryData(authKeys.me, (current: unknown) => (current ? user : current))
      return user
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  if (!token) return <Alert tone="error">{t('errors.INVALID_TOKEN')}</Alert>
  if (confirmation.isPending) {
    return <p className="text-center text-muted">{t('auth.confirmEmail.pending')}</p>
  }
  if (confirmation.isError) {
    return <Alert tone="error">{errorMessage(t, confirmation.error)}</Alert>
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success">
        {t('auth.confirmEmail.done', { email: confirmation.data.email })}
      </Alert>
      <Link
        to="/"
        className="rounded-md bg-accent px-4 py-2.5 text-center font-medium text-accent-contrast hover:opacity-90"
      >
        {t('auth.verify.continue')}
      </Link>
    </div>
  )
}
