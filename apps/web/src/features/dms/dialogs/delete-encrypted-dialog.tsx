import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { errorMessage } from '../../../lib/errors'
import { useDeleteEncrypted } from '../use-dm-actions'

import type { PrivateChannel } from '@chinchi/shared'

/** Deleting an encrypted conversation for everyone in it, after saying what that means. */
export const DeleteEncryptedDialog = ({
  channel,
  onOpenChange,
}: {
  channel: PrivateChannel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const remove = useDeleteEncrypted(channel.id)

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('dm.deleteTitle')}
      description={t('dm.deleteText')}
    >
      <div className="flex flex-col gap-3">
        {remove.isError ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" pending={remove.isPending} onClick={() => remove.mutate()}>
            {t('dm.deleteConfirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
