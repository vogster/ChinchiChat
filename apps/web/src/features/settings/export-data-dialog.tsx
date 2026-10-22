import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { PasswordField } from '../../components/ui/password-field'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useShell } from '../shell/shell-context'
import { useSaveFile } from '../shell/use-save-file'

/** Where the archive is, for one download. */
const exportPath = (ticket: string) => `/api/v1/users/@me/export/${encodeURIComponent(ticket)}`

/** The browser downloads it as it is built, straight to disk. */
const startDownload = (path: string) => {
  const link = document.createElement('a')
  link.href = path
  link.download = ''
  link.click()
}

export interface ExportDataDialogProps {
  readonly username: string
  readonly mfaEnabled: boolean
  readonly onClose: () => void
}

/**
 * Everything the user wrote, behind the password (and a code with 2FA on): a stolen session
 * alone must not carry all of it away. The server answers with a one-time ticket for the
 * download. In the desktop app the page can't hand the session to a plain link, so the archive
 * comes through the API and is saved with "Save as".
 */
export const ExportDataDialog = ({ username, mfaEnabled, onClose }: ExportDataDialogProps) => {
  const { t } = useTranslation()
  const api = useApi()
  const shell = useShell()
  const save = useSaveFile()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const ready = password !== '' && (!mfaEnabled || code.trim() !== '')
  const run = useMutation({
    mutationFn: async () => {
      const { ticket } = await api.users.exportTicket(
        password,
        mfaEnabled ? code.trim() : undefined,
      )
      const path = exportPath(ticket)
      if (!shell) {
        startDownload(path)
        return
      }
      const day = new Date().toISOString().slice(0, 10)
      await save(`chinchi-${username}-${day}.zip`, await api.media.download(path))
    },
    onSuccess: onClose,
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.export.download')}
      description={t('settings.export.confirm')}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) run.mutate()
        }}
      >
        <PasswordField
          label={t('settings.export.password')}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {mfaEnabled ? (
          <TextField
            label={t('settings.export.code')}
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        ) : null}
        {run.isError ? <Alert tone="error">{errorMessage(t, run.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" pending={run.isPending} disabled={!ready}>
            {t('settings.export.start')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
