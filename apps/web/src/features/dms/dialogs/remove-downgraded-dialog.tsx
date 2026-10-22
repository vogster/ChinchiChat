import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { errorMessage } from '../../../lib/errors'
import { useRemoveDowngraded } from '../use-dm-actions'

/**
 * Taking away a conversation the server stopped calling encrypted: nothing can be sent in it,
 * and the server won't delete a "plain" one for everyone, so it is hidden from the list and
 * wiped from this device.
 */
export const RemoveDowngradedDialog = ({
  channelId,
  onOpenChange,
}: {
  channelId: string
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const remove = useRemoveDowngraded(channelId)

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('e2ee.downgrade.removeTitle')}
      description={t('e2ee.downgrade.removeText')}
    >
      <div className="flex flex-col gap-3">
        {remove.isError ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" pending={remove.isPending} onClick={() => remove.mutate()}>
            {t('e2ee.downgrade.removeConfirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
