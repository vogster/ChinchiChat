import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { TextField } from '../../../components/ui/text-field'
import { errorMessage } from '../../../lib/errors'
import { useRenameGroup } from '../use-dm-actions'

import type { PrivateChannel } from '@chinchi/shared'

export const RenameGroupDialog = ({
  channel,
  onOpenChange,
}: {
  channel: PrivateChannel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const rename = useRenameGroup(channel.id)
  const [name, setName] = useState(channel.name ?? '')

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('dm.rename')}
      description={t('dm.renameHint')}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          rename.mutate(name, { onSuccess: () => onOpenChange(false) })
        }}
      >
        <TextField
          label={t('dm.renameLabel')}
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
        />
        {rename.isError ? <Alert tone="error">{errorMessage(t, rename.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" pending={rename.isPending}>
            {t('dm.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
