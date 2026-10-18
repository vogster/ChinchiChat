import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { MfaConfirmDialog } from './mfa-confirm-dialog'
import { MfaSetupDialog } from './mfa-setup-dialog'

type Open = 'setup' | 'renew' | 'disable' | null

/** Two-factor sign-in: its state and the ways to change it. */
export const MfaSettings = ({ enabled }: { enabled: boolean }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        {t('settings.mfa.status')}{' '}
        <span className={enabled ? 'font-semibold text-secure-text' : 'font-semibold text-muted'}>
          {enabled ? t('settings.mfa.on') : t('settings.mfa.off')}
        </span>
      </p>
      <p className="text-sm text-muted">{t('settings.mfa.text')}</p>
      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" fullWidth={false} onClick={() => setOpen('renew')}>
            {t('settings.mfa.renew')}
          </Button>
          <Button variant="danger" fullWidth={false} onClick={() => setOpen('disable')}>
            {t('settings.mfa.disable')}
          </Button>
        </div>
      ) : (
        <Button fullWidth={false} onClick={() => setOpen('setup')}>
          {t('settings.mfa.start')}
        </Button>
      )}
      {open === 'setup' ? <MfaSetupDialog onClose={close} /> : null}
      {open === 'renew' || open === 'disable' ? (
        <MfaConfirmDialog kind={open} onClose={close} />
      ) : null}
    </div>
  )
}
