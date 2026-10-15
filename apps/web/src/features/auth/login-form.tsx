import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { loginRequestSchema } from '@chinchi/shared'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { MfaStep } from './mfa-step'
import { useLogin } from './use-auth-actions'

import type { LoginRequest } from '@chinchi/shared'

export const LoginForm = ({ redirectTo }: { redirectTo?: string | undefined }) => {
  const [ticket, setTicket] = useState<string | null>(null)
  if (ticket) {
    return <MfaStep ticket={ticket} redirectTo={redirectTo} onRestart={() => setTicket(null)} />
  }
  return <PasswordStep redirectTo={redirectTo} onMfa={setTicket} />
}

const PasswordStep = ({
  redirectTo,
  onMfa,
}: {
  redirectTo: string | undefined
  onMfa: (ticket: string) => void
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
