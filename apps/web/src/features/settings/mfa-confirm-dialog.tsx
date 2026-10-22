import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/dialog'
import { ConfirmIdentityForm } from './confirm-identity-form'
import { RecoveryCodes } from './recovery-codes'
import { useMfaActions } from './use-mfa-actions'

/** Turning 2FA off or renewing recovery codes: the password, then a code (two steps). */
export const MfaConfirmDialog = ({
  kind,
  onClose,
}: {
  kind: 'renew' | 'disable'
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const actions = useMfaActions()
  const [codes, setCodes] = useState<string[] | null>(null)
  const title = kind === 'renew' ? t('settings.mfa.renew') : t('settings.mfa.disable')

  const confirm = async (password: string, code: string | undefined) => {
    const body = { password, ...(code ? { code } : {}) }
    if (kind === 'renew') {
      setCodes((await actions.renew.mutateAsync(body)).recoveryCodes)
      return
    }
    await actions.disable.mutateAsync(body)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <ConfirmIdentityForm
          mfaEnabled
          passwordLabel={t('auth.fields.password')}
          codeLabel={t('auth.mfa.code')}
          submitLabel={
            kind === 'renew' ? t('settings.mfa.continue') : t('settings.mfa.disableConfirm')
          }
          variant={kind === 'disable' ? 'danger' : 'primary'}
          confirm={confirm}
        />
      )}
    </Dialog>
  )
}
