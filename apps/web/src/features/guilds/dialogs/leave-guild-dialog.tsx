import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { errorMessage } from '../../../lib/errors'
import { useLeaveGuild } from '../use-guild-actions'

import type { GuildDetail } from '@chinchi/shared'

export const LeaveGuildDialog = ({
  guild,
  onOpenChange,
}: {
  guild: GuildDetail
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const leave = useLeaveGuild(guild.id)

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('leaveGuild.title', { name: guild.name })}
      description={t('leaveGuild.text')}
    >
      <div className="flex flex-col gap-3">
        {leave.isError ? <Alert tone="error">{errorMessage(t, leave.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" pending={leave.isPending} onClick={() => leave.mutate()}>
            {t('leaveGuild.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
