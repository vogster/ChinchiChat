import { mfaCodeSchema } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { RecoveryCodes } from './recovery-codes'
import { useMfaActions } from './use-mfa-actions'

/** Turning 2FA off or renewing recovery codes: both need the password and a code. */
export const MfaConfirmDialog = ({
  kind,
  onClose,
}: {
  kind: 'renew' | 'disable'
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const actions = useMfaActions()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const action = kind === 'renew' ? actions.renew : actions.disable
  const title = kind === 'renew' ? t('settings.mfa.renew') : t('settings.mfa.disable')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const parsed = mfaCodeSchema.safeParse(code)
            if (!parsed.success) return
            const body = { password, code: parsed.data }
            if (kind === 'renew') {
              actions.renew.mutate(body, { onSuccess: (r) => setCodes(r.recoveryCodes) })
            } else {
              actions.disable.mutate(body, { onSuccess: onClose })
            }
          }}
        >
          <TextField
            label={t('auth.fields.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label={t('auth.mfa.code')}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {action.isError ? <Alert tone="error">{errorMessage(t, action.error)}</Alert> : null}
          <Button
            type="submit"
            variant={kind === 'disable' ? 'danger' : 'primary'}
            pending={action.isPending}
            disabled={!password || !code}
          >
            {kind === 'renew' ? t('settings.mfa.continue') : t('settings.mfa.disableConfirm')}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
