import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { passwordSchema } from '@chinchi/shared'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

const formSchema = z.object({ password: passwordSchema })
type FormValues = z.infer<typeof formSchema>

export const ResetPasswordForm = ({ token }: { token: string | undefined }) => {
  const { t } = useTranslation()
  const api = useApi()
  const reset = useMutation({
    mutationFn: ({ password }: FormValues) => api.auth.resetPassword(token ?? '', password),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) })

  const backToLogin = (
    <Link to="/login" className="text-sm font-medium text-accent hover:underline">
      {t('common.backToLogin')}
    </Link>
  )

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error">{t('auth.reset.missingToken')}</Alert>
        {backToLogin}
      </div>
    )
  }

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{t('auth.reset.done')}</Alert>
        {backToLogin}
      </div>
    )
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((v) => reset.mutate(v))}
    >
      {reset.isError ? <Alert tone="error">{errorMessage(t, reset.error)}</Alert> : null}
      <TextField
        label={t('auth.fields.newPassword')}
        type="password"
        autoComplete="new-password"
        autoFocus
        error={errors.password ? t('validation.password') : undefined}
        {...register('password')}
      />
      <Button type="submit" pending={reset.isPending}>
        {t('auth.reset.submit')}
      </Button>
    </form>
  )
}
