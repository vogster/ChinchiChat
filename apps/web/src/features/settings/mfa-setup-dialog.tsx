import { totpCodeSchema } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { PasswordField } from '../../components/ui/password-field'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { QrCode } from './qr-code'
import { RecoveryCodes } from './recovery-codes'
import { useMfaActions } from './use-mfa-actions'

import type { TotpSetup } from '@chinchi/shared'

/** Password → scan the QR code and confirm with a code → keep the recovery codes. */
export const MfaSetupDialog = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  const actions = useMfaActions()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const error = actions.setup.error ?? actions.enable.error

  const body = codes ? (
    <RecoveryCodes codes={codes} onDone={onClose} />
  ) : setup ? (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = totpCodeSchema.safeParse(code)
        if (parsed.success) {
          actions.enable.mutate(parsed.data, { onSuccess: (r) => setCodes(r.recoveryCodes) })
        }
      }}
    >
      <p className="text-sm">{t('settings.mfa.scan')}</p>
      <div className="flex justify-center">
        <QrCode value={setup.uri} label={t('settings.mfa.qr')} />
      </div>
      <p className="text-xs text-muted">{t('settings.mfa.manual')}</p>
      <code className="rounded bg-rail px-2 py-1 text-center font-mono text-sm break-all">
        {setup.secret}
      </code>
      <TextField
        label={t('settings.mfa.appCode')}
        autoComplete="one-time-code"
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <Button type="submit" pending={actions.enable.isPending}>
        {t('settings.mfa.enable')}
      </Button>
    </form>
  ) : (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        actions.setup.mutate(password, { onSuccess: setSetup })
      }}
    >
      <p className="text-sm">{t('settings.mfa.passwordFirst')}</p>
      <PasswordField
        label={t('auth.fields.password')}
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <Button type="submit" pending={actions.setup.isPending} disabled={!password}>
        {t('settings.mfa.continue')}
      </Button>
    </form>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('settings.mfa.title')}>
      {body}
    </Dialog>
  )
}
