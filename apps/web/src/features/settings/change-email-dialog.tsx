import { emailSchema } from '@chinchi/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { ConfirmIdentityForm } from './confirm-identity-form'

/**
 * A new address for the account: with the password (and a code when 2FA is on) a link goes to
 * it; the account moves there once the link is followed.
 */
export const ChangeEmailDialog = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation()
  const api = useApi()
  const mfaEnabled = useCurrentUser()?.mfaEnabled ?? false
  const [email, setEmail] = useState('')
  const [invalid, setInvalid] = useState(false)
  const change = useMutation({
    mutationFn: (body: { email: string; password: string; code: string | undefined }) =>
      api.auth.changeEmail({
        email: body.email,
        password: body.password,
        ...(body.code ? { code: body.code } : {}),
      }),
  })

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('settings.changeEmail.title')}
      description={t('settings.changeEmail.subtitle')}
    >
      {change.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">
            {t('settings.changeEmail.sent', { email: change.variables.email })}
          </Alert>
          <Button onClick={() => onOpenChange(false)}>{t('settings.changeEmail.done')}</Button>
        </div>
      ) : (
        <ConfirmIdentityForm
          mfaEnabled={mfaEnabled}
          passwordLabel={t('settings.changeEmail.password')}
          codeLabel={t('settings.changeEmail.code')}
          submitLabel={t('settings.changeEmail.submit')}
          before={
            <TextField
              label={t('settings.changeEmail.email')}
              type="email"
              autoComplete="email"
              value={email}
              error={invalid ? t('validation.email') : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          }
          beforeReady={email !== ''}
          validate={() => {
            const parsed = emailSchema.safeParse(email)
            setInvalid(!parsed.success)
            return parsed.success
          }}
          confirm={(password, code) =>
            change.mutateAsync({ email: emailSchema.parse(email), password, code })
          }
        />
      )}
    </Dialog>
  )
}
