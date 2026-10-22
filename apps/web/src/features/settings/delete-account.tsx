import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { authKeys } from '../auth/queries'
import { useCurrentUser } from '../auth/use-auth-actions'
import { ConfirmIdentityForm } from './confirm-identity-form'

/** Deletes the account for good after the password; the user lands on the sign-in page. */
export const DeleteAccount = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const titleId = useId()
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const remove = useMutation({
    mutationFn: ({ password, code }: { password: string; code: string | undefined }) =>
      api.users.deleteMe(password, code),
    onSuccess: async () => {
      queryClient.clear()
      queryClient.setQueryData(authKeys.me, null)
      await navigate({ to: '/login' })
    },
  })

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-card bg-stage p-4 shadow-[inset_0_0_0_1.5px_var(--zl-danger-soft)]"
    >
      <h2 id={titleId} className="mb-1 text-[13.5px] font-semibold text-danger">
        {t('settings.deleteAccount.title')}
      </h2>
      <p className="mb-3 text-sm text-muted">{t('settings.deleteAccount.text')}</p>
      <ConfirmIdentityForm
        mfaEnabled={mfaEnabled}
        passwordLabel={t('settings.deleteAccount.password')}
        codeLabel={t('settings.deleteAccount.code')}
        submitLabel={t('settings.deleteAccount.confirm')}
        variant="danger"
        confirm={(password, code) => remove.mutateAsync({ password, code })}
      />
    </section>
  )
}
