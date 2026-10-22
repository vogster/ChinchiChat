import { Bell, Ellipsis, LogOut, Pencil, Phone, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { headerButtonClass as headerButton } from '../../components/layout/page-header'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'

import type { ReactNode } from 'react'

export type DmHeaderDialog = 'rename' | 'add' | 'leave' | 'delete'

/**
 * The buttons on the right of a DM's header. The header has room for all of them only on wide
 * screens: on phones the notifications, the encryption check and deleting wait behind "more",
 * and so do a group's rename / add / leave until the screen is wide enough for them too.
 */
export const DmHeaderActions = ({
  encrypted,
  verified,
  group,
  canDelete,
  notifications,
  onNotifications,
  onCheck,
  onCall,
  onDialog,
  leading,
}: {
  encrypted: boolean
  /** Everyone checked: the shield shows it. */
  verified: boolean
  group: boolean
  canDelete: boolean
  notifications: boolean
  onNotifications: () => void
  onCheck: () => void
  /** Null when no call can start from here. */
  onCall: (() => void) | null
  onDialog: (dialog: DmHeaderDialog) => void
  /** Shown first (the way back to the notice about old messages). */
  leading?: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <span className="flex shrink-0 gap-0.5">
      {leading}
      {encrypted ? (
        <button
          type="button"
          aria-label={t('e2ee.safety.title')}
          title={t('e2ee.safety.title')}
          onClick={onCheck}
          data-verified={verified}
          className={`${headerButton} max-md:hidden data-[verified=true]:text-secure-text`}
        >
          <ShieldCheck aria-hidden className="size-5" />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t('notifications.dmButton')}
        title={t('notifications.dmButton')}
        aria-pressed={notifications}
        onClick={onNotifications}
        className={`${headerButton} max-md:hidden`}
      >
        <Bell aria-hidden className="size-5" />
      </button>
      {canDelete ? (
        <button
          type="button"
          aria-label={t('dm.delete')}
          title={t('dm.delete')}
          onClick={() => onDialog('delete')}
          className={`${headerButton} max-md:hidden hover:bg-danger-soft hover:text-danger`}
        >
          <Trash2 aria-hidden className="size-5" />
        </button>
      ) : null}
      {onCall ? (
        <button
          type="button"
          aria-label={t('voice.call')}
          title={t('voice.call')}
          onClick={onCall}
          className={headerButton}
        >
          <Phone aria-hidden className="size-5" />
        </button>
      ) : null}
      {group ? (
        <>
          <button
            type="button"
            aria-label={t('dm.rename')}
            title={t('dm.rename')}
            onClick={() => onDialog('rename')}
            className={`${headerButton} hidden 2xl:grid`}
          >
            <Pencil aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('dm.add')}
            title={t('dm.add')}
            onClick={() => onDialog('add')}
            className={`${headerButton} hidden 2xl:grid`}
          >
            <UserPlus aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('dm.leave')}
            title={t('dm.leave')}
            onClick={() => onDialog('leave')}
            className={`${headerButton} hidden hover:bg-danger-soft hover:text-danger 2xl:grid`}
          >
            <LogOut aria-hidden className="size-5" />
          </button>
        </>
      ) : null}
      <Menu>
        <MenuTrigger
          aria-label={t('common.more')}
          className={`${headerButton} ${group ? '2xl:hidden' : 'md:hidden'}`}
        >
          <Ellipsis aria-hidden className="size-5" />
        </MenuTrigger>
        <MenuContent>
          {encrypted ? (
            <MenuItem
              onSelect={onCheck}
              icon={<ShieldCheck aria-hidden className="size-4" />}
              className="md:hidden"
            >
              {t('e2ee.safety.title')}
            </MenuItem>
          ) : null}
          <MenuItem
            onSelect={onNotifications}
            icon={<Bell aria-hidden className="size-4" />}
            className="md:hidden"
          >
            {t('notifications.dmButton')}
          </MenuItem>
          {group ? (
            <>
              <MenuItem
                onSelect={() => onDialog('rename')}
                icon={<Pencil aria-hidden className="size-4" />}
              >
                {t('dm.rename')}
              </MenuItem>
              <MenuItem
                onSelect={() => onDialog('add')}
                icon={<UserPlus aria-hidden className="size-4" />}
              >
                {t('dm.add')}
              </MenuItem>
            </>
          ) : null}
          {canDelete ? (
            <MenuItem
              onSelect={() => onDialog('delete')}
              icon={<Trash2 aria-hidden className="size-4" />}
              danger
              className="md:hidden"
            >
              {t('dm.delete')}
            </MenuItem>
          ) : null}
          {group ? (
            <MenuItem
              onSelect={() => onDialog('leave')}
              icon={<LogOut aria-hidden className="size-4" />}
              danger
            >
              {t('dm.leave')}
            </MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
    </span>
  )
}
