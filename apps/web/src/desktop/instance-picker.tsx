import { createApiClient } from '@chinchi/sdk'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { TextField } from '../components/ui/text-field'
import { normalizeInstanceUrl } from './instance-url'

import type { FetchLike } from '@chinchi/sdk'
import type { FormEvent } from 'react'

export interface InstancePickerProps {
  readonly fetch: FetchLike
  /** The address last used, offered as the default. */
  readonly initialUrl?: string | null
  readonly onChosen: (instanceUrl: string, instanceName: string) => void
}

/**
 * The first screen of the desktop app: which Chinchi to connect to. The address is checked by
 * asking that server who it is before it is remembered.
 */
export const InstancePicker = ({ fetch, initialUrl, onChosen }: InstancePickerProps) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialUrl ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const instanceUrl = normalizeInstanceUrl(value)
    if (!instanceUrl) {
      setError(t('desktop.instance.invalid'))
      return
    }
    setPending(true)
    setError(null)
    try {
      const api = createApiClient({ baseUrl: `${instanceUrl}/api/v1`, fetch })
      const { instance } = await api.instance.get()
      onChosen(instanceUrl, instance.name)
    } catch {
      setError(t('desktop.instance.unreachable'))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-main p-6 text-normal">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-field p-6 shadow-lg"
        onSubmit={(event) => void submit(event)}
      >
        <h1 className="text-xl font-bold">{t('desktop.instance.title')}</h1>
        <p className="text-sm text-muted">{t('desktop.instance.hint')}</p>
        <TextField
          label={t('desktop.instance.label')}
          placeholder="chat.example.com"
          value={value}
          autoFocus
          autoComplete="url"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" pending={pending}>
          {t('desktop.instance.connect')}
        </Button>
      </form>
    </main>
  )
}
