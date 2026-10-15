import { Crown, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { usePresences } from '../messages/use-presence'
import { userName } from './dm-names'
import { useRemoveFromGroup } from './use-dm-actions'

import type { PrivateChannel, PublicUser } from '@chinchi/shared'

/** Everyone in a group DM; its owner may remove people from here. */
export const GroupMembersPanel = ({ channel, me }: { channel: PrivateChannel; me: PublicUser }) => {
  const { t } = useTranslation()
  const presences = usePresences()
  const remove = useRemoveFromGroup(channel)
  const isOwner = channel.ownerId === me.id
  const people = [me, ...channel.recipients]
  const heading = t('dm.members')

  return (
    <aside
      aria-label={heading}
      className="hidden w-60 shrink-0 flex-col overflow-y-auto bg-sidebar p-3 lg:flex"
    >
      <h2 className="px-2 pb-1 text-xs font-bold tracking-wide text-muted uppercase">
        {heading} — {people.length}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {people.map((user) => {
          const status = presences[user.id] ?? 'offline'
          const name = userName(user)
          return (
            <li
              key={user.id}
              data-status={status}
              className="group flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-hover data-[status=offline]:opacity-50"
            >
              <span className="relative shrink-0">
                <Avatar name={name} src={user.avatarUrl} id={user.id} className="size-8 text-sm" />
                <PresenceDot status={status} label={t(`presence.${status}`)} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {name}
                {user.id === me.id ? (
                  <span className="ml-1 text-xs text-muted">({t('dm.you')})</span>
                ) : null}
              </span>
              {user.id === channel.ownerId ? (
                <Crown aria-label={t('dm.owner')} className="size-4 shrink-0 text-yellow-500" />
              ) : null}
              {isOwner && user.id !== me.id ? (
                <button
                  type="button"
                  aria-label={t('friends.actionLabel', { action: t('dm.remove'), name })}
                  title={t('dm.remove')}
                  onClick={() => remove.mutate(user.id)}
                  className="rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
