import { qrLoginCodeSchema } from '@chinchi/shared'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { withSettings } from './settings-search'

/**
 * Letting another device in by the short code under its QR (for a device that can't scan):
 * the code leads to the same approval a scan opens, over the page behind the settings.
 */
export const SignInOtherDevice = () => {
  const { t } = useTranslation()
  const api = useApi()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const find = useMutation({
    mutationFn: async (normalised: string) => (await api.auth.qr.findByCode(normalised)).login,
    onSuccess: (login) =>
      navigate({
        to: '.',
        search: (prev: Record<string, unknown>) =>
          ({ ...(withSettings(undefined)(prev) as object), qr: login.id }) as never,
      }),
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = qrLoginCodeSchema.safeParse(code)
        setInvalid(!parsed.success)
        if (parsed.success) find.mutate(parsed.data)
      }}
    >
      <p className="text-sm text-muted">{t('settings.qrSignIn.hint')}</p>
      {find.isError ? <Alert tone="error">{errorMessage(t, find.error)}</Alert> : null}
      <TextField
        label={t('settings.qrSignIn.code')}
        autoComplete="off"
        placeholder="KQ7M-2PXD"
        value={code}
        error={invalid ? t('settings.qrSignIn.invalid') : undefined}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button type="submit" fullWidth={false} className="self-start" pending={find.isPending}>
        {t('settings.qrSignIn.submit')}
      </Button>
    </form>
  )
}
