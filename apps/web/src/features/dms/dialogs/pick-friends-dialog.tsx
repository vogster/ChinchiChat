import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../../components/ui/alert'
import { Avatar } from '../../../components/ui/avatar'
import { Button } from '../../../components/ui/button'
import { Dialog } from '../../../components/ui/dialog'
import { useApi } from '../../../lib/api-context'
import { errorMessage } from '../../../lib/errors'
import { relationshipsQueryOptions } from '../../friends/queries'
import { userName } from '../dm-names'

import type { Snowflake } from '@chinchi/shared'
import type { ReactNode } from 'react'

export interface PickFriendsDialogProps {
  readonly title: string
  readonly submitLabel: string
  /** Friends already in the group are not offered. */
  readonly excludeIds?: readonly Snowflake[]
  readonly max: number
  readonly pending: boolean
  readonly error: unknown
  readonly onSubmit: (userIds: Snowflake[]) => void
  readonly onOpenChange: (open: boolean) => void
  /** More choices under the list (e.g. encryption of a new group). */
  readonly extra?: ReactNode
}

/** Pick friends for a group DM, up to `max` of them. */
export const PickFriendsDialog = ({
  title,
  submitLabel,
  excludeIds = [],
  max,
  pending,
  error,
  onSubmit,
  onOpenChange,
  extra,
}: PickFriendsDialogProps) => {
  const { t } = useTranslation()
  const { data: relationships = [] } = useQuery(relationshipsQueryOptions(useApi()))
  const [picked, setPicked] = useState<readonly Snowflake[]>([])
  const friends = relationships
    .filter((r) => r.type === 'friend' && !excludeIds.includes(r.user.id))
    .map((r) => r.user)
    .sort((a, b) => userName(a).localeCompare(userName(b)))

  const toggle = (id: Snowflake) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    )

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={title}
      description={t('dm.pickHint', { count: max })}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (picked.length > 0) onSubmit([...picked])
        }}
      >
        {friends.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{t('dm.noFriends')}</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            {friends.map((friend) => {
              const checked = picked.includes(friend.id)
              return (
                <li key={friend.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-chip">
                    <Avatar
                      name={userName(friend)}
                      src={friend.avatarUrl}
                      id={friend.id}
                      className="size-8"
                    />
                    <span className="flex-1 truncate">{userName(friend)}</span>
                    <input
                      type="checkbox"
                      aria-label={userName(friend)}
                      checked={checked}
                      disabled={!checked && picked.length >= max}
                      onChange={() => toggle(friend.id)}
                      className="size-4 accent-[var(--zl-accent)]"
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {extra}
        {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" pending={pending} disabled={picked.length === 0}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
