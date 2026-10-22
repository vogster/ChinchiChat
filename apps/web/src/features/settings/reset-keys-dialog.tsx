import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { PasswordField } from '../../components/ui/password-field'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'

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
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const ready = password !== '' && (!mfaEnabled || code.trim() !== '')
  const run = useMutation({
    mutationFn: () => reset(mfaEnabled ? { password, code: code.trim() } : { password }),
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
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) run.mutate()
        }}
      >
        <PasswordField
          label={t('e2ee.recovery.resetPassword')}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mfaEnabled ? (
          <TextField
            label={t('e2ee.recovery.resetCode')}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        ) : null}
        {run.isError ? <Alert tone="error">{errorMessage(t, run.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger" pending={run.isPending} disabled={!ready}>
            {t('e2ee.recovery.resetConfirm')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
