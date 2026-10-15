import { isApiError } from '@chinchi/sdk'
import { mfaCodeSchema } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { useLoginMfa } from './use-auth-actions'

/** The second step of signing in: a code from the authenticator app or a recovery code. */
export const MfaStep = ({
  ticket,
  redirectTo,
  onRestart,
}: {
  ticket: string
  redirectTo: string | undefined
  onRestart: () => void
}) => {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const confirm = useLoginMfa(redirectTo)
  // A spent or expired ticket can't be retried: the password has to be entered again.
  const expired = isApiError(confirm.error) && confirm.error.code === 'INVALID_MFA_TICKET'

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = mfaCodeSchema.safeParse(code)
        setInvalid(!parsed.success)
        if (parsed.success) confirm.mutate({ ticket, code: parsed.data })
      }}
    >
      <p className="text-sm text-muted">{t('auth.mfa.prompt')}</p>
      {confirm.isError ? <Alert tone="error">{errorMessage(t, confirm.error)}</Alert> : null}
      <TextField
        label={t('auth.mfa.code')}
        autoComplete="one-time-code"
        inputMode="text"
        autoFocus
        value={code}
        error={invalid ? t('auth.mfa.invalid') : undefined}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" pending={confirm.isPending} disabled={expired}>
        {t('auth.mfa.submit')}
      </Button>
      <Button variant="link" onClick={onRestart}>
        {t('auth.mfa.back')}
      </Button>
    </form>
  )
}
