import { GROUP_DM_MAX_MEMBERS } from '@chinchi/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Switch } from '../../../components/ui/switch'
import { useOpenDm } from '../use-dm-actions'
import { PickFriendsDialog } from './pick-friends-dialog'

/** One friend opens your DM with them; several start a group, encrypted if asked. */
export const CreateGroupDialog = ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => {
  const { t } = useTranslation()
  const open = useOpenDm()
  const [encrypted, setEncrypted] = useState(false)

  return (
    <PickFriendsDialog
      title={t('dm.createTitle')}
      submitLabel={t('dm.create')}
      max={GROUP_DM_MAX_MEMBERS - 1}
      pending={open.isPending}
      error={open.error}
      onSubmit={(userIds) =>
        open.mutate(encrypted ? { ids: userIds, encrypted: true } : userIds, {
          onSuccess: () => onOpenChange(false),
        })
      }
      onOpenChange={onOpenChange}
      extra={
        <Switch
          checked={encrypted}
          onCheckedChange={setEncrypted}
          label={t('e2ee.start')}
          description={t('e2ee.groupHint')}
        />
      }
    />
  )
}
