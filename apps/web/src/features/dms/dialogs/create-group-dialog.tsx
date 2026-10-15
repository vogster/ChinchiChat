import { GROUP_DM_MAX_MEMBERS } from '@chinchi/shared'
import { useTranslation } from 'react-i18next'

import { useOpenDm } from '../use-dm-actions'
import { PickFriendsDialog } from './pick-friends-dialog'

/** One friend opens your DM with them; several start a group. */
export const CreateGroupDialog = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation()
  const open = useOpenDm()

  return (
    <PickFriendsDialog
      title={t('dm.createTitle')}
      submitLabel={t('dm.create')}
      max={GROUP_DM_MAX_MEMBERS - 1}
      pending={open.isPending}
      error={open.error}
      onSubmit={(userIds) => open.mutate(userIds, { onSuccess: () => onOpenChange(false) })}
      onOpenChange={onOpenChange}
    />
  )
}
