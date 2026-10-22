import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/dialog'
import { useCurrentUser } from '../auth/use-auth-actions'
import { ConfirmIdentityForm } from './confirm-identity-form'

import type { IdentityProof } from '../e2ee/cross-signing'

export interface ResetKeysDialogProps {
  readonly reset: (identity: IdentityProof) => Promise<void>
  readonly onClose: () => void
}

/**
 * New encryption keys after losing everything: a warning, then the password (and a code with
 * 2FA on), so that a stolen session alone can't throw the keys and the history backup away.
 */
export const ResetKeysDialog = ({ reset, onClose }: ResetKeysDialogProps) => {
  const { t } = useTranslation()
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const run = useMutation({
    mutationFn: ({ password, code }: { password: string; code: string | undefined }) =>
      reset(code ? { password, code } : { password }),
    onSuccess: onClose,
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('e2ee.recovery.resetTitle')}
      description={t('e2ee.recovery.resetText')}
    >
      <ConfirmIdentityForm
        mfaEnabled={mfaEnabled}
        passwordLabel={t('e2ee.recovery.resetPassword')}
        codeLabel={t('e2ee.recovery.resetCode')}
        submitLabel={t('e2ee.recovery.resetConfirm')}
        variant="danger"
        onCancel={onClose}
        confirm={(password, code) => run.mutateAsync({ password, code })}
      />
    </Dialog>
  )
}
