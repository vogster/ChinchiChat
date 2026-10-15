import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser, useResendVerification } from './use-auth-actions'

export const VerifyEmailBanner = () => {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const resend = useResendVerification()

  if (!user || user.emailVerified) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-4 py-2 text-center text-sm text-accent-contrast"
    >
      <span>{t('auth.verify.banner', { email: user.email })}</span>
      {resend.isSuccess ? (
        <span className="font-semibold">{t('auth.verify.resent')}</span>
      ) : resend.isError ? (
        <span className="font-semibold">{errorMessage(t, resend.error)}</span>
      ) : (
        <Button variant="on-accent" pending={resend.isPending} onClick={() => resend.mutate()}>
          {t('auth.verify.resend')}
        </Button>
      )}
    </div>
  )
}
