import { loginRequestSchema } from '@chinchi/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { QrCode as QrCodeIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { MfaStep } from './mfa-step'
import { QrLoginPanel } from './qr-login-panel'
import { useLogin } from './use-auth-actions'

import type { LoginRequest } from '@chinchi/shared'

/** `qrBeside`: the sign-in QR is shown next to the form, so no button opens it. */
export const LoginForm = ({
  redirectTo,
  qrBeside = false,
}: {
  redirectTo?: string | undefined
  qrBeside?: boolean
}) => {
  const [ticket, setTicket] = useState<string | null>(null)
  const [withQr, setWithQr] = useState(false)
  if (ticket) {
    return <MfaStep ticket={ticket} redirectTo={redirectTo} onRestart={() => setTicket(null)} />
  }
  if (withQr) return <QrLoginPanel redirectTo={redirectTo} onBack={() => setWithQr(false)} />
  return (
    <PasswordStep
      redirectTo={redirectTo}
      onMfa={setTicket}
      onQr={qrBeside ? undefined : () => setWithQr(true)}
    />
  )
}

const PasswordStep = ({
  redirectTo,
  onMfa,
  onQr,
}: {
  redirectTo: string | undefined
  onMfa: (ticket: string) => void
  onQr: (() => void) | undefined
}) => {
  const { t } = useTranslation()
  const login = useLogin(redirectTo, onMfa)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) })

  const required = (failed: boolean) => (failed ? t('validation.required') : undefined)

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((v) => login.mutate(v))}
    >
      {login.isError ? <Alert tone="error">{errorMessage(t, login.error)}</Alert> : null}

      <TextField
        label={t('auth.fields.login')}
        autoComplete="username"
        autoFocus
        error={required(Boolean(errors.login))}
        {...register('login')}
      />
      <TextField
        label={t('auth.fields.password')}
        type="password"
        autoComplete="current-password"
        error={required(Boolean(errors.password))}
        {...register('password')}
      />

      <Link to="/forgot-password" className="-mt-2 text-sm text-accent hover:underline">
        {t('auth.login.forgot')}
      </Link>

      <Button type="submit" pending={login.isPending}>
        {t('auth.login.submit')}
      </Button>
      {onQr ? (
        <Button
          variant="secondary"
          className="inline-flex items-center justify-center gap-2"
          onClick={onQr}
        >
          <QrCodeIcon aria-hidden className="size-4" />
          {t('auth.qr.show')}
        </Button>
      ) : null}

      <p className="text-sm text-muted">
        {t('auth.login.noAccount')}{' '}
        <Link
          to="/register"
          search={{ redirect: redirectTo }}
          className="font-medium text-accent hover:underline"
        >
          {t('auth.login.register')}
        </Link>
      </p>
    </form>
  )
}
