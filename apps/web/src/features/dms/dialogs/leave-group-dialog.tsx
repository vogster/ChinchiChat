import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { errorMessage } from '../../../lib/errors'
import { useCurrentUser } from '../../auth/use-auth-actions'
import { useLeaveGroup } from '../use-dm-actions'

import type { PrivateChannel } from '@chinchi/shared'

export const LeaveGroupDialog = ({
  channel,
  onOpenChange,
}: {
  channel: PrivateChannel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const leave = useLeaveGroup(channel.id, useCurrentUser()?.id)

  return (
    <Dialog open onOpenChange={onOpenChange} title={t('dm.leave')} description={t('dm.leaveText')}>
      <div className="flex flex-col gap-3">
        {leave.isError ? <Alert tone="error">{errorMessage(t, leave.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" pending={leave.isPending} onClick={() => leave.mutate()}>
            {t('dm.leave')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
