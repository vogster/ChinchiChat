import { isApiError } from '@chinchi/sdk'
import { registerRequestSchema } from '@chinchi/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { PasswordField } from '../../components/ui/password-field'
import { TextField } from '../../components/ui/text-field'
import { errorMessage } from '../../lib/errors'
import { useRegister } from './use-auth-actions'

import type { RegisterRequest } from '@chinchi/shared'

/** Server errors that belong to a specific field rather than the whole form. */
const FIELD_ERRORS: Readonly<Record<string, keyof RegisterRequest>> = {
  USERNAME_TAKEN: 'username',
  EMAIL_TAKEN: 'email',
  INVITE_REQUIRED: 'inviteCode',
  INVALID_INVITE: 'inviteCode',
}

export const RegisterForm = ({
  redirectTo,
  inviteRequired = false,
  inviteCode,
}: {
  redirectTo?: string | undefined
  /** The instance registers by invite: ask for the code (prefilled from the link). */
  inviteRequired?: boolean
  inviteCode?: string | undefined
}) => {
  const { t, i18n } = useTranslation()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerRequestSchema),
    defaultValues: inviteRequired && inviteCode ? { inviteCode } : {},
  })

  const signUp = useRegister(redirectTo)
  const fieldError = isApiError(signUp.error) ? FIELD_ERRORS[signUp.error.code] : undefined

  // Emails come in the language the app is shown in.
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'ru'
  const onSubmit = handleSubmit((values) =>
    signUp.mutate(
      { ...values, locale },
      {
        onError: (error) => {
          const field = isApiError(error) ? FIELD_ERRORS[error.code] : undefined
          if (field) setError(field, { type: 'server', message: errorMessage(t, error) })
        },
      },
    ),
  )

  /** Server errors carry their own translated message; client errors show the field's rule. */
  const message = (field: Exclude<keyof RegisterRequest, 'locale'>) => {
    const error = errors[field]
    if (!error) return undefined
    return error.type === 'server' ? error.message : t(`validation.${field}`)
  }

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={onSubmit}>
      {signUp.isError && !fieldError ? (
        <Alert tone="error">{errorMessage(t, signUp.error)}</Alert>
      ) : null}

      <TextField
        label={t('auth.fields.email')}
        type="email"
        autoComplete="email"
        autoFocus
        error={message('email')}
        {...register('email')}
      />
      <TextField
        label={t('auth.fields.username')}
        autoComplete="username"
        error={message('username')}
        {...register('username')}
      />
      <PasswordField
        label={t('auth.fields.password')}
        autoComplete="new-password"
        error={message('password')}
        {...register('password')}
      />
      {inviteRequired ? (
        <TextField
          label={t('auth.fields.inviteCode')}
          autoComplete="off"
          error={message('inviteCode')}
          {...register('inviteCode', { setValueAs: (value: string) => value || undefined })}
        />
      ) : null}

      <Button type="submit" pending={signUp.isPending}>
        {t('auth.register.submit')}
      </Button>

      <p className="text-sm text-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link
          to="/login"
          search={{ redirect: redirectTo }}
          className="font-medium text-accent hover:underline"
        >
          {t('auth.register.login')}
        </Link>
      </p>
    </form>
  )
}
