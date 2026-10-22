import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, List, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MainCard } from '../../components/layout/main-card'
import { PageHeader, PageTitle } from '../../components/layout/page-header'
import { Alert } from '../../components/ui/alert'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useOpenDm } from '../dms/use-dm-actions'
import { formatMentionCount } from '../messages/mentions'
import { usePresences } from '../messages/use-presence'
import { useVoiceEnabled } from '../voice/use-voice-people'
import { useVoice } from '../voice/voice-context'
import { AddFriendForm } from './add-friend-form'
import { friendActions } from './friend-actions'
import { FriendRow } from './friend-row'
import { relationshipsQueryOptions } from './queries'
import { readFriendsLayout, saveFriendsLayout } from './use-friends-layout'
import { useIncomingRequests } from './use-incoming-requests'
import { useRelationshipActions } from './use-relationship-actions'

import type { FriendAction } from './friend-actions'
import type { FriendsLayout } from './friend-row'
import type { Relationship } from '@chinchi/shared'

const LIST_TABS = ['online', 'all', 'pending', 'blocked'] as const
type ListTab = (typeof LIST_TABS)[number]
type Tab = ListTab | 'add'

const nameOf = (r: Relationship) => r.user.displayName ?? r.user.username
const byName = (a: Relationship, b: Relationship) => nameOf(a).localeCompare(nameOf(b))

const segmentClass =
  'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-muted transition-colors hover:text-text aria-selected:bg-chip aria-selected:text-text'

const toggleClass =
  'grid size-8 place-items-center rounded-full text-faint transition-colors hover:text-text aria-pressed:bg-chip aria-pressed:text-text'

/** Home: friends, requests and blocks, and a way to add people by username. */
export const FriendsPage = () => {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('online')
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<FriendsLayout>(readFriendsLayout)
  const { data: relationships = [] } = useQuery(relationshipsQueryOptions(useApi()))
  const presences = usePresences()
  const actions = useRelationshipActions()
  const openDm = useOpenDm()
  const voice = useVoice()
  const voiceEnabled = useVoiceEnabled()
  const requests = useIncomingRequests()

  const shown: Record<ListTab, (r: Relationship) => boolean> = {
    online: (r) => r.type === 'friend' && presences[r.user.id] !== undefined,
    all: (r) => r.type === 'friend',
    pending: (r) => r.type === 'pending_in' || r.type === 'pending_out',
    blocked: (r) => r.type === 'blocked',
  }
  const needle = query.trim().toLocaleLowerCase()
  const matches = (r: Relationship) =>
    !needle ||
    nameOf(r).toLocaleLowerCase().includes(needle) ||
    r.user.username.toLocaleLowerCase().includes(needle)
  const pickLayout = (next: FriendsLayout) => {
    saveFriendsLayout(next)
    setLayout(next)
  }

  const tabButton = (value: Tab, className: string) => (
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
      className={className}
    >
      {t(`friends.tabs.${value}`)}
      {value === 'pending' && requests > 0 ? (
        <span
          aria-hidden
          className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-danger-contrast"
        >
          {formatMentionCount(requests)}
        </span>
      ) : null}
    </button>
  )

  return (
    <MainCard>
      <PageHeader>
        <PageTitle glyph={<Users className="size-5" />} title={t('friends.title')} />
      </PageHeader>

      {/* One row that scrolls sideways on a phone, never wrapping. */}
      <div
        role="tablist"
        aria-label={t('friends.tabsLabel')}
        className="flex shrink-0 items-center gap-2 overflow-x-auto px-4 pb-3 whitespace-nowrap [scrollbar-width:none] md:px-5"
      >
        <span className="flex gap-1 rounded-card bg-stage p-1">
          {LIST_TABS.map((value) => tabButton(value, segmentClass))}
        </span>
        {tabButton(
          'add',
          'ml-auto h-10 shrink-0 rounded-full bg-accent px-4 text-[13px] font-semibold text-accent-contrast transition hover:brightness-110 aria-selected:shadow-[0_0_0_2px_var(--zl-main),0_0_0_4px_var(--zl-accent)]',
        )}
      </div>

      <section role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-5">
        {tab === 'add' ? (
          <AddFriendForm request={actions.request} />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <input
                type="search"
                aria-label={t('friends.search')}
                placeholder={t('friends.search')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-[38px] min-w-0 flex-1 rounded-full bg-field px-4 text-[13px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
              />
              <span className="flex shrink-0 gap-0.5 rounded-full bg-field p-[3px]">
                <button
                  type="button"
                  aria-pressed={layout === 'grid'}
                  aria-label={t('friends.layoutGrid')}
                  title={t('friends.layoutGrid')}
                  onClick={() => pickLayout('grid')}
                  className={toggleClass}
                >
                  <LayoutGrid aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  aria-pressed={layout === 'list'}
                  aria-label={t('friends.layoutList')}
                  title={t('friends.layoutList')}
                  onClick={() => pickLayout('list')}
                  className={toggleClass}
                >
                  <List aria-hidden className="size-4" />
                </button>
              </span>
            </div>
            {openDm.isError ? (
              <div className="mb-3">
                <Alert tone="error">{errorMessage(t, openDm.error)}</Alert>
              </div>
            ) : null}
            <FriendList
              label={t(`friends.tabs.${tab}`)}
              empty={needle ? t('friends.searchEmpty') : t(`friends.empty.${tab}`)}
              layout={layout}
              relationships={relationships.filter(shown[tab]).filter(matches).sort(byName)}
              actionsFor={(relationship) =>
                friendActions(t, relationship, {
                  message: (id) => openDm.mutate([id]),
                  secret: (id) => openDm.mutate({ ids: [id], encrypted: true }),
                  call: voiceEnabled
                    ? (id) =>
                        void openDm
                          .mutateAsync([id])
                          .then(({ channel }) => voice.join(null, channel.id))
                          .catch(() => undefined)
                    : null,
                  accept: (id) => actions.accept.mutate(id),
                  block: (id) => actions.block.mutate(id),
                  remove: (id) => actions.remove.mutate(id),
                })
              }
            />
          </>
        )}
      </section>
    </MainCard>
  )
}

const FriendList = ({
  label,
  empty,
  layout,
  relationships,
  actionsFor,
}: {
  label: string
  empty: string
  layout: FriendsLayout
  relationships: readonly Relationship[]
  actionsFor: (relationship: Relationship) => FriendAction[]
}) =>
  relationships.length === 0 ? (
    <p className="p-8 text-center text-faint">{empty}</p>
  ) : (
    <ul
      aria-label={label}
      data-layout={layout}
      className={
        layout === 'grid'
          ? 'grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3'
          : 'flex flex-col overflow-hidden rounded-[24px] bg-stage'
      }
    >
      {relationships.map((relationship) => (
        <FriendRow
          key={relationship.user.id}
          relationship={relationship}
          actions={actionsFor(relationship)}
          layout={layout}
        />
      ))}
    </ul>
  )
