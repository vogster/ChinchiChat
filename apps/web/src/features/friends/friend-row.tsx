import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { usePresence } from '../messages/use-presence'
import { ProfileTrigger } from '../profile/profile-trigger'

import type { Relationship } from '@chinchi/shared'

export interface FriendAction {
  readonly label: string
  readonly onClick: () => void
  readonly tone?: 'danger'
}

const STATUS_KEY = {
  friend: null,
  pending_in: 'friends.incoming',
  pending_out: 'friends.outgoing',
  blocked: 'friends.blocked',
} as const

/** One person in a friends list, with the actions that fit the relationship. */
export const FriendRow = ({
  relationship,
  actions,
}: {
  relationship: Relationship
  actions: readonly FriendAction[]
}) => {
  const { t } = useTranslation()
  const { user, type } = relationship
  const status = usePresence(user.id)
  const name = user.displayName ?? user.username
  const statusKey = STATUS_KEY[type]

  return (
    <li className="flex items-center gap-3 border-t border-border px-2 py-2.5 hover:bg-hover/40">
      <span className="relative">
        <Avatar name={name} src={user.avatarUrl} id={user.id} className="size-9" />
        {type === 'friend' ? (
          <span className="absolute -right-0.5 -bottom-0.5">
            <PresenceDot status={status} label={t(`presence.${status}`)} />
          </span>
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <ProfileTrigger
          userId={user.id}
          guildId={null}
          name={name}
          className="truncate font-semibold"
        >
          {name}
        </ProfileTrigger>
        <span className="truncate text-xs text-muted">
          {statusKey ? t(statusKey) : t(`presence.${status}`)}
        </span>
      </span>
      <span className="flex gap-1">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            aria-label={t('friends.actionLabel', { action: action.label, name })}
            onClick={action.onClick}
            className="rounded-md bg-elevated px-3 py-1.5 text-sm font-medium text-text hover:bg-hover data-[tone=danger]:text-danger"
            data-tone={action.tone}
          >
            {action.label}
          </button>
        ))}
      </span>
    </li>
  )
}
