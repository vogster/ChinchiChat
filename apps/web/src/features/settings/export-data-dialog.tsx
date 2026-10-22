import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { useShell } from '../shell/shell-context'
import { useSaveFile } from '../shell/use-save-file'
import { ConfirmIdentityForm } from './confirm-identity-form'

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
  const run = useMutation({
    mutationFn: async ({ password, code }: { password: string; code: string | undefined }) => {
      const { ticket } = await api.users.exportTicket(password, code)
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
      <ConfirmIdentityForm
        mfaEnabled={mfaEnabled}
        passwordLabel={t('settings.export.password')}
        codeLabel={t('settings.export.code')}
        submitLabel={t('settings.export.start')}
        onCancel={onClose}
        confirm={(password, code) => run.mutateAsync({ password, code })}
      />
    </Dialog>
  )
}
