import { describeUserAgent } from '@chinchi/shared'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { formatRelativeTime } from '../../lib/relative-time'
import { useGateway } from '../realtime/gateway-context'
import { withSettings } from '../settings/settings-search'
import { approvedHere } from './approved-here'

import type { QrSignInEvent } from '@chinchi/shared'

/**
 * Someone signed in to this account by a QR: every open session but the one that approved it
 * asks whether it was them. If not, the devices list is where to end that session.
 */
export const NewSignInNotice = () => {
  const { t, i18n } = useTranslation()
  const gateway = useGateway()
  const navigate = useNavigate()
  const [signIn, setSignIn] = useState<QrSignInEvent | null>(null)

  useEffect(
    () =>
      gateway.subscribe((type, data) => {
        if (type !== 'SESSION_CREATE') return
        const event = data as QrSignInEvent
        if (!approvedHere(event.qrLoginId)) setSignIn(event)
      }),
    [gateway],
  )

  if (!signIn) return null
  const close = () => setSignIn(null)
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('auth.newSignIn.title')}
      description={t('auth.newSignIn.question')}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-field bg-side px-4 py-3 text-sm">
          <dt className="text-muted">{t('auth.qrApprove.device')}</dt>
          <dd>{describeUserAgent(signIn.userAgent) ?? t('settings.sessions.unknownDevice')}</dd>
          {signIn.ipAddress ? (
            <>
              <dt className="text-muted">{t('auth.qrApprove.address')}</dt>
              <dd>{signIn.ipAddress}</dd>
            </>
          ) : null}
          <dt className="text-muted">{t('auth.qrApprove.when')}</dt>
          <dd>{formatRelativeTime(signIn.createdAt, i18n.language)}</dd>
        </dl>
        <p className="text-sm text-muted">{t('auth.newSignIn.hint')}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              close()
              void navigate({ to: '.', search: withSettings('sessions') })
            }}
          >
            {t('auth.newSignIn.notMe')}
          </Button>
          <Button onClick={close}>{t('auth.newSignIn.me')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
