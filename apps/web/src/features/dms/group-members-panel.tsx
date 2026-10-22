import { Crown, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { PresenceDot } from '../../components/ui/presence-dot'
import { PeopleStackButton } from '../guilds/members-stack-button'
import { usePresences } from '../messages/use-presence'
import { userName } from './dm-names'
import { useRemoveFromGroup } from './use-dm-actions'

import type { PrivateChannel, PublicUser } from '@chinchi/shared'

/** Everyone in a group DM; its owner may remove people from here. */
export const GroupMembersPanel = ({
  channel,
  me,
  narrowOpen = false,
}: {
  channel: PrivateChannel
  me: PublicUser
  /** Narrow screens: slides over the chat from the right while open. */
  narrowOpen?: boolean
}) => {
  const { t } = useTranslation()
  const presences = usePresences()
  const remove = useRemoveFromGroup(channel)
  const isOwner = channel.ownerId === me.id
  const people = [me, ...channel.recipients]
  const heading = t('dm.members')

  return (
    <aside
      aria-label={heading}
      className={`${narrowOpen ? 'fixed inset-y-2.5 right-2.5 z-40 flex shadow-modal' : 'hidden'} w-[260px] shrink-0 flex-col overflow-y-auto rounded-panel bg-side p-3 xl:static xl:z-auto xl:flex xl:shadow-none`}
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
              className="group flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-chip data-[status=offline]:opacity-50"
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
                <Crown aria-label={t('dm.owner')} className="size-4 shrink-0 text-warning-text" />
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

/**
 * The group header's members toggles, as on servers: on wide screens it shows and hides the
 * list beside the chat, on narrow ones it opens the list over the chat.
 */
export const GroupMembersButtons = ({
  channel,
  me,
  shown,
  onToggle,
  onOpenNarrow,
}: {
  channel: PrivateChannel
  me: PublicUser
  shown: boolean
  onToggle: () => void
  onOpenNarrow: () => void
}) => {
  const { t } = useTranslation()
  const people = [me, ...channel.recipients].map((user) => ({
    id: user.id,
    name: userName(user),
    avatarUrl: user.avatarUrl,
  }))
  return (
    <>
      <PeopleStackButton
        people={people}
        aria-pressed={shown}
        aria-label={shown ? t('dm.hideMembers') : t('dm.showMembers')}
        onClick={onToggle}
        className="hidden xl:flex"
      />
      <PeopleStackButton
        people={people}
        aria-label={t('dm.showMembers')}
        onClick={onOpenNarrow}
        className="flex xl:hidden"
      />
    </>
  )
}

/** Behind the members opened over the chat: dims it, and closes them on a click. */
export const GroupMembersBackdrop = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={t('dm.hideMembers')}
      onClick={onClose}
      className="fixed inset-0 z-30 bg-[rgb(8_8_16/0.5)] backdrop-blur-[3px] xl:hidden"
    />
  )
}
