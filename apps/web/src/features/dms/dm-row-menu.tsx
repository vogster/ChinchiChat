import { EyeOff, LogOut, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'
import { LeaveGroupDialog } from './dialogs/leave-group-dialog'
import { useHideDm } from './use-dm-actions'

import type { PrivateChannel } from '@chinchi/shared'

/** What a DM in the list offers: hide it until the next message, or leave a group. */
export const DmRowMenu = ({ channel, name }: { channel: PrivateChannel; name: string }) => {
  const { t } = useTranslation()
  const hide = useHideDm(channel.id)
  const [leaving, setLeaving] = useState(false)

  return (
    <>
      <Menu>
        <MenuTrigger
          aria-label={t('dm.actions', { name })}
          title={t('dm.actions', { name })}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-chip hover:text-text data-[state=open]:opacity-100"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => hide.mutate()} icon={<EyeOff aria-hidden className="size-4" />}>
            {t('dm.hide')}
          </MenuItem>
          {channel.type === 'group_dm' ? (
            <MenuItem
              danger
              onSelect={() => setLeaving(true)}
              icon={<LogOut aria-hidden className="size-4" />}
            >
              {t('dm.leave')}
            </MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
      {leaving ? <LeaveGroupDialog channel={channel} onOpenChange={setLeaving} /> : null}
    </>
  )
}
