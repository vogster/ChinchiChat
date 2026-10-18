import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from '../auth/queries'
import { useCurrentUser } from '../auth/use-auth-actions'

/** Deletes the account for good after the password; the user lands on the sign-in page. */
export const DeleteAccount = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const titleId = useId()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const ready = password !== '' && (!mfaEnabled || code.trim() !== '')
  const remove = useMutation({
    mutationFn: () => api.users.deleteMe(password, mfaEnabled ? code.trim() : undefined),
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
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) remove.mutate()
        }}
      >
        <TextField
          label={t('settings.deleteAccount.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mfaEnabled ? (
          <TextField
            label={t('settings.deleteAccount.code')}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        ) : null}
        {remove.isError ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
        <Button
          type="submit"
          variant="danger"
          fullWidth={false}
          pending={remove.isPending}
          disabled={!ready}
        >
          {t('settings.deleteAccount.confirm')}
        </Button>
      </form>
    </section>
  )
}
