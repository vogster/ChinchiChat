import { Ellipsis, Lock, Phone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/menu'
import { PresenceDot } from '../../components/ui/presence-dot'
import { usePresence } from '../messages/use-presence'
import { ProfileTrigger } from '../profile/profile-trigger'

import type { FriendAction, FriendActionKind } from './friend-actions'
import type { Relationship } from '@chinchi/shared'

export type FriendsLayout = 'grid' | 'list'

const STATUS_KEY = {
  friend: null,
  pending_in: 'friends.incoming',
  pending_out: 'friends.outgoing',
  blocked: 'friends.blocked',
} as const

const round = 'grid size-9 shrink-0 place-items-center rounded-full transition hover:brightness-110'

/** One colour set per kind, so utilities of one property never meet in one element. */
const KIND_CLASS: Readonly<Record<Exclude<FriendActionKind, 'menu'>, string>> = {
  accent: 'h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-contrast',
  soft: 'h-9 rounded-full bg-accent-soft px-4 text-[13px] font-semibold text-accent-text',
  ghost: 'h-9 rounded-full bg-field px-4 text-[13px] font-medium text-muted hover:text-text',
  secret: `${round} bg-secure-soft text-secure-text`,
  call: `${round} bg-field text-muted hover:text-text`,
}

const ActionButton = ({ action, name }: { action: FriendAction; name: string }) => {
  const { t } = useTranslation()
  const kind = action.kind === 'menu' ? 'ghost' : action.kind
  const icon =
    kind === 'secret' ? (
      <Lock aria-hidden className="size-4" />
    ) : kind === 'call' ? (
      <Phone aria-hidden className="size-4" />
    ) : null
  return (
    <button
      type="button"
      aria-label={t('friends.actionLabel', { action: action.label, name })}
      title={icon ? action.label : undefined}
      onClick={action.onClick}
      className={`shrink-0 ${KIND_CLASS[kind]}`}
    >
      {icon ?? action.label}
    </button>
  )
}

/** Someone in a friends list: a card in the grid, a row in the list, with fitting actions. */
export const FriendRow = ({
  relationship,
  actions,
  layout,
}: {
  relationship: Relationship
  actions: readonly FriendAction[]
  layout: FriendsLayout
}) => {
  const { t } = useTranslation()
  const { user, type } = relationship
  const status = usePresence(user.id)
  const name = user.displayName ?? user.username
  const statusKey = STATUS_KEY[type]
  const shown = actions.filter((action) => action.kind !== 'menu')
  const more = actions.filter((action) => action.kind === 'menu')
  const grid = layout === 'grid'

  const person = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="relative shrink-0">
        <Avatar
          name={name}
          src={user.avatarUrl}
          id={user.id}
          rounded={grid ? 'rounded-tile' : 'rounded-[14px]'}
          className={grid ? 'size-[46px]' : 'size-10'}
        />
        {type === 'friend' ? (
          <PresenceDot status={status} label={t(`presence.${status}`)} border="border-stage" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <ProfileTrigger
          userId={user.id}
          guildId={null}
          name={name}
          className="truncate font-semibold"
        >
          {name}
        </ProfileTrigger>
        <span className="truncate text-[12.5px] text-faint">
          {statusKey ? t(statusKey) : t(`presence.${status}`)}
        </span>
      </span>
    </span>
  )

  const buttons = (
    <span className={`flex items-center gap-1.5 ${grid ? '' : 'shrink-0'}`}>
      {shown.map((action) => (
        <ActionButton key={action.label} action={action} name={name} />
      ))}
      {more.length > 0 ? (
        <Menu>
          <MenuTrigger
            aria-label={t('friends.more', { name })}
            className={`${round} bg-field text-muted hover:text-text data-[state=open]:bg-chip`}
          >
            <Ellipsis aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            {more.map((action) => (
              <MenuItem
                key={action.label}
                danger={action.tone === 'danger'}
                onSelect={action.onClick}
              >
                {action.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
    </span>
  )

  return grid ? (
    <li className="flex flex-col gap-3.5 rounded-[24px] bg-stage p-4">
      {person}
      {buttons}
    </li>
  ) : (
    <li className="relative flex items-center gap-3 px-3.5 py-3 not-last:after:absolute not-last:after:right-3.5 not-last:after:bottom-0 not-last:after:left-[66px] not-last:after:h-px not-last:after:bg-line">
      {person}
      {buttons}
    </li>
  )
}
