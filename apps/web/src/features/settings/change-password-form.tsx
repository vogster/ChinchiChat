import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@chinchi/sdk'
import { passwordSchema } from '@chinchi/shared'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { authKeys } from '../auth/queries'

const formSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  })

type FormValues = z.infer<typeof formSchema>

export const ChangePasswordForm = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) })

  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      api.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: async () => {
      reset()
      await queryClient.invalidateQueries({ queryKey: authKeys.sessions })
    },
    onError: (error) => {
      if (isApiError(error) && error.code === 'INVALID_CURRENT_PASSWORD') {
        setError('currentPassword', { type: 'server', message: errorMessage(t, error) })
      }
    },
  })

  const fieldMessage = (field: keyof FormValues) => {
    const error = errors[field]
    if (!error) return undefined
    if (error.type === 'server') return error.message
    if (field === 'confirmPassword') return t('settings.account.mismatch')
    return field === 'newPassword' ? t('validation.password') : t('validation.required')
  }

  const showFormError =
    change.isError &&
    !(isApiError(change.error) && change.error.code === 'INVALID_CURRENT_PASSWORD')

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((v) => change.mutate(v))}
    >
      {change.isSuccess ? (
        <Alert tone="success">{t('settings.account.passwordChanged')}</Alert>
      ) : null}
      {showFormError ? <Alert tone="error">{errorMessage(t, change.error)}</Alert> : null}

      <TextField
        label={t('settings.account.currentPassword')}
        type="password"
        autoComplete="current-password"
        error={fieldMessage('currentPassword')}
        {...register('currentPassword')}
      />
      <TextField
        label={t('settings.account.newPassword')}
        type="password"
        autoComplete="new-password"
        error={fieldMessage('newPassword')}
        {...register('newPassword')}
      />
      <TextField
        label={t('settings.account.confirmPassword')}
        type="password"
        autoComplete="new-password"
        error={fieldMessage('confirmPassword')}
        {...register('confirmPassword')}
      />
      <Button type="submit" pending={change.isPending} className="sm:w-auto sm:self-start">
        {t('settings.account.changePassword')}
      </Button>
    </form>
  )
}
