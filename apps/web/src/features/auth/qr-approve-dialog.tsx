import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Switch } from '../../components/ui/switch'
import { errorMessage } from '../../lib/errors'
import { formatRelativeTime } from '../../lib/relative-time'
import { describeUserAgent } from '../settings/user-agent'
import { withQrLogin } from './qr-login-search'
import { useQrApproval } from './use-qr-approval'

import type { QrLoginSearch } from './qr-login-search'

const Approval = ({
  id,
  scannedKey,
  onClose,
}: {
  id: string
  scannedKey: string | undefined
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const { login, canHandOver, approve } = useQrApproval(id, scannedKey)
  const [handOver, setHandOver] = useState(true)
  const info = login.data

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('auth.qrApprove.title')}
      description={t('auth.qrApprove.question')}
    >
      <div className="flex flex-col gap-4">
        {login.isError ? <Alert tone="error">{errorMessage(t, login.error)}</Alert> : null}
        {approve.isError ? <Alert tone="error">{errorMessage(t, approve.error)}</Alert> : null}
        {approve.isSuccess ? (
          <>
            <Alert tone="success">{t('auth.qrApprove.done')}</Alert>
            <Button onClick={onClose}>{t('auth.qrApprove.close')}</Button>
          </>
        ) : info ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-field bg-side px-4 py-3 text-sm">
              <dt className="text-muted">{t('auth.qrApprove.device')}</dt>
              <dd>{describeUserAgent(info.userAgent) ?? t('settings.sessions.unknownDevice')}</dd>
              {info.ipAddress ? (
                <>
                  <dt className="text-muted">{t('auth.qrApprove.address')}</dt>
                  <dd>{info.ipAddress}</dd>
                </>
              ) : null}
              <dt className="text-muted">{t('auth.qrApprove.when')}</dt>
              <dd>{formatRelativeTime(info.createdAt, i18n.language)}</dd>
            </dl>
            <Alert tone="info">{t('auth.qrApprove.warning')}</Alert>
            {canHandOver ? (
              <Switch
                checked={handOver}
                onCheckedChange={setHandOver}
                label={t('auth.qrApprove.handOver')}
                description={t('auth.qrApprove.handOverHint')}
              />
            ) : null}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                {t('auth.qrApprove.no')}
              </Button>
              <Button pending={approve.isPending} onClick={() => approve.mutate(handOver)}>
                {t('auth.qrApprove.yes')}
              </Button>
            </div>
          </>
        ) : login.isError ? (
          <Button variant="secondary" onClick={onClose}>
            {t('auth.qrApprove.close')}
          </Button>
        ) : (
          <p className="text-sm text-muted">{t('auth.qrApprove.loading')}</p>
        )}
      </div>
    </Dialog>
  )
}

/** Opens over any page of the app when a sign-in QR was scanned (`?qr=`) or its code typed. */
export const QrApproveDialog = () => {
  const navigate = useNavigate()
  const { qr, qrKey } = useSearch({ strict: false }) as QrLoginSearch
  if (!qr) return null
  return (
    <Approval
      key={qr}
      id={qr}
      scannedKey={qrKey}
      onClose={() => void navigate({ to: '.', search: withQrLogin(undefined) })}
    />
  )
}
