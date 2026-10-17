import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageHeader } from '../../components/layout/page-header'
import { useApi } from '../../lib/api-context'
import { useOpenDm } from '../dms/use-dm-actions'
import { formatMentionCount } from '../messages/mentions'
import { usePresences } from '../messages/use-presence'
import { AddFriendForm } from './add-friend-form'
import { FriendRow } from './friend-row'
import { relationshipsQueryOptions } from './queries'
import { useIncomingRequests } from './use-incoming-requests'
import { useRelationshipActions } from './use-relationship-actions'

import type { FriendAction } from './friend-row'
import type { Relationship } from '@chinchi/shared'
import type { TFunction } from 'i18next'

const TABS = ['online', 'all', 'pending', 'blocked', 'add'] as const
type Tab = (typeof TABS)[number]
type ListTab = Exclude<Tab, 'add'>

const byName = (a: Relationship, b: Relationship) =>
  (a.user.displayName ?? a.user.username).localeCompare(b.user.displayName ?? b.user.username)

const tabBase =
  'rounded px-2 py-0.5 text-sm font-medium hover:bg-hover hover:text-text aria-selected:bg-hover aria-selected:text-text'
// The colour sits in one utility per tab so the two never compete.
const tabClass = `${tabBase} text-muted`
const addTabClass = `${tabBase} text-accent`

/** Home: friends, requests and blocks, and a way to add people by username. */
export const FriendsPage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('online')
  const { data: relationships = [] } = useQuery(relationshipsQueryOptions(useApi()))
  const presences = usePresences()
  const actions = useRelationshipActions()
  const openDm = useOpenDm()
  const requests = useIncomingRequests()

  const shown: Record<ListTab, (r: Relationship) => boolean> = {
    online: (r) => r.type === 'friend' && presences[r.user.id] !== undefined,
    all: (r) => r.type === 'friend',
    pending: (r) => r.type === 'pending_in' || r.type === 'pending_out',
    blocked: (r) => r.type === 'blocked',
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader>
        <Users aria-hidden className="size-5 shrink-0 text-muted" />
        <h1 className="mr-2 shrink-0">{t('friends.title')}</h1>
        {/* One row that scrolls sideways on a phone, never wrapping out of the header. */}
        <div
          role="tablist"
          aria-label={t('friends.tabsLabel')}
          className="flex min-w-0 gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none]"
        >
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-label={
                value === 'pending' && requests > 0
                  ? `${t('friends.tabs.pending')} (${t('friends.incomingCount', { count: requests })})`
                  : undefined
              }
              onClick={() => setTab(value)}
              className={value === 'add' ? addTabClass : tabClass}
            >
              {t(`friends.tabs.${value}`)}
              {value === 'pending' && requests > 0 ? (
                <span
                  aria-hidden
                  className="ml-1.5 rounded-full bg-danger px-1.5 text-xs leading-4 font-bold text-danger-contrast"
                >
                  {formatMentionCount(requests)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </PageHeader>

      <section role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'add' ? (
          <AddFriendForm request={actions.request} />
        ) : (
          <FriendList
            label={t(`friends.tabs.${tab}`)}
            empty={t(`friends.empty.${tab}`)}
            relationships={relationships.filter(shown[tab]).sort(byName)}
            actionsFor={(relationship) =>
              actionsFor(t, relationship, {
                message: (id) => openDm.mutate([id]),
                accept: (id) => actions.accept.mutate(id),
                block: (id) => actions.block.mutate(id),
                remove: (id) => actions.remove.mutate(id),
              })
            }
          />
        )}
      </section>
    </div>
  )
}

const FriendList = ({
  label,
  empty,
  relationships,
  actionsFor: actionsOf,
}: {
  label: string
  empty: string
  relationships: readonly Relationship[]
  actionsFor: (relationship: Relationship) => FriendAction[]
}) =>
  relationships.length === 0 ? (
    <p className="p-8 text-center text-muted">{empty}</p>
  ) : (
    <div className="px-4 py-3">
      <h2 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
        {label} — {relationships.length}
      </h2>
      <ul aria-label={label}>
        {relationships.map((relationship) => (
          <FriendRow
            key={relationship.user.id}
            relationship={relationship}
            actions={actionsOf(relationship)}
          />
        ))}
      </ul>
    </div>
  )

interface Handlers {
  readonly message: (userId: string) => void
  readonly accept: (userId: string) => void
  readonly block: (userId: string) => void
  readonly remove: (userId: string) => void
}

const actionsFor = (t: TFunction, { user, type }: Relationship, h: Handlers): FriendAction[] => {
  switch (type) {
    case 'friend':
      return [
        { label: t('friends.message'), onClick: () => h.message(user.id) },
        { label: t('friends.remove'), onClick: () => h.remove(user.id), tone: 'danger' },
        { label: t('friends.block'), onClick: () => h.block(user.id), tone: 'danger' },
      ]
    case 'pending_in':
      return [
        { label: t('friends.accept'), onClick: () => h.accept(user.id) },
        { label: t('friends.decline'), onClick: () => h.remove(user.id), tone: 'danger' },
        { label: t('friends.block'), onClick: () => h.block(user.id), tone: 'danger' },
      ]
    case 'pending_out':
      return [{ label: t('friends.cancel'), onClick: () => h.remove(user.id), tone: 'danger' }]
    case 'blocked':
      return [{ label: t('friends.unblock'), onClick: () => h.remove(user.id) }]
  }
}
