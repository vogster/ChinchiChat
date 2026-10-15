import { GROUP_DM_MAX_MEMBERS } from '@chinchi/shared'
import { useTranslation } from 'react-i18next'

import { useAddToGroup } from '../use-dm-actions'
import { PickFriendsDialog } from './pick-friends-dialog'

import type { PrivateChannel } from '@chinchi/shared'

export const AddToGroupDialog = ({
  channel,
  onOpenChange,
}: {
  channel: PrivateChannel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const add = useAddToGroup(channel.id)
  // The viewer is not among the recipients but takes a seat too.
  const seatsLeft = GROUP_DM_MAX_MEMBERS - channel.recipients.length - 1

  return (
    <PickFriendsDialog
      title={t('dm.addTitle')}
      submitLabel={t('dm.addSubmit')}
      excludeIds={channel.recipients.map((user) => user.id)}
      max={Math.max(0, seatsLeft)}
      pending={add.isPending}
      error={add.error}
      onSubmit={(userIds) => add.mutate(userIds, { onSuccess: () => onOpenChange(false) })}
      onOpenChange={onOpenChange}
    />
  )
}
