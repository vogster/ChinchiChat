import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { QrCode } from '../settings/qr-code'
import { useQrLogin } from './use-qr-login'

/**
 * Signing in without a password: a device where the user is signed in scans this QR (or takes
 * the short code under it) and says yes. That device's session counts for 2FA too. Beside the
 * form on wide screens; on narrow ones it replaces the form, with a way back.
 */
export const QrLoginPanel = ({
  redirectTo,
  onBack,
}: {
  redirectTo: string | undefined
  onBack?: () => void
}) => {
  const { t } = useTranslation()
  const { ticket, error, approved } = useQrLogin(redirectTo)

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {onBack ? null : <h2 className="text-lg font-semibold">{t('auth.qr.title')}</h2>}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      {approved ? (
        <Alert tone="success">{t('auth.qr.signingIn')}</Alert>
      ) : ticket ? (
        <>
          <QrCode value={ticket.url} label={t('auth.qr.codeLabel')} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('auth.qr.manualCode')}</span>
            <span className="font-mono text-lg font-semibold tracking-widest" aria-live="polite">
              {ticket.code}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t('auth.qr.matchLabel')}</span>
            <span className="text-4xl font-semibold tabular-nums" aria-live="polite">
              {ticket.match}
            </span>
          </div>
        </>
      ) : error ? null : (
        <p className="text-sm text-muted">{t('auth.qr.preparing')}</p>
      )}
      {onBack ? (
        <ol className="list-decimal space-y-1 pl-5 text-left text-sm text-muted">
          <li>{t('auth.qr.step1')}</li>
          <li>{t('auth.qr.step2')}</li>
          <li>{t('auth.qr.step3')}</li>
        </ol>
      ) : (
        <p className="text-sm text-muted">{t('auth.qr.hint')}</p>
      )}
      {onBack ? (
        <Button variant="link" onClick={onBack}>
          {t('auth.qr.back')}
        </Button>
      ) : null}
    </div>
  )
}
