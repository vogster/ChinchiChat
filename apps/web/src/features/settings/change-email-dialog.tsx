import { emailSchema } from '@chinchi/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'

/**
 * A new address for the account: with the password (and a code when 2FA is on) a link goes to
 * it; the account moves there once the link is followed.
 */
export const ChangeEmailDialog = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation()
  const api = useApi()
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const change = useMutation({
    mutationFn: (address: string) =>
      api.auth.changeEmail({
        email: address,
        password,
        ...(mfaEnabled ? { code: code.trim() } : {}),
      }),
  })
  const ready = email !== '' && password !== '' && (!mfaEnabled || code.trim() !== '')

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('settings.changeEmail.title')}
      description={t('settings.changeEmail.subtitle')}
    >
      {change.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">
            {t('settings.changeEmail.sent', { email: change.variables })}
          </Alert>
          <Button onClick={() => onOpenChange(false)}>{t('settings.changeEmail.done')}</Button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = emailSchema.safeParse(email)
            setInvalid(!parsed.success)
            if (parsed.success && ready) change.mutate(parsed.data)
          }}
        >
          <TextField
            label={t('settings.changeEmail.email')}
            type="email"
            autoComplete="email"
            value={email}
            error={invalid ? t('validation.email') : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label={t('settings.changeEmail.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mfaEnabled ? (
            <TextField
              label={t('settings.changeEmail.code')}
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          ) : null}
          {change.isError ? <Alert tone="error">{errorMessage(t, change.error)}</Alert> : null}
          <Button type="submit" pending={change.isPending} disabled={!ready}>
            {t('settings.changeEmail.submit')}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
