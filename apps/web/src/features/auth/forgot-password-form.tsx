import { forgotPasswordRequestSchema } from '@chinchi/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

import type { ForgotPasswordRequest } from '@chinchi/shared'

export const ForgotPasswordForm = () => {
  const { t } = useTranslation()
  const api = useApi()
  const forgot = useMutation({
    mutationFn: ({ email }: ForgotPasswordRequest) => api.auth.forgotPassword(email),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordRequest>({ resolver: zodResolver(forgotPasswordRequestSchema) })

  if (forgot.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t('auth.forgot.sent')}</Alert>
        <Link to="/login" className="text-sm font-medium text-accent hover:underline">
          {t('common.backToLogin')}
        </Link>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((v) => forgot.mutate(v))}
    >
      {forgot.isError ? <Alert tone="error">{errorMessage(t, forgot.error)}</Alert> : null}
      <TextField
        label={t('auth.fields.email')}
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email ? t('validation.email') : undefined}
        {...register('email')}
      />
      <Button type="submit" pending={forgot.isPending}>
        {t('auth.forgot.submit')}
      </Button>
      <Link to="/login" className="text-sm font-medium text-accent hover:underline">
        {t('common.backToLogin')}
      </Link>
    </form>
  )
}
