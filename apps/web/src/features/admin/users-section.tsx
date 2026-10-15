import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { SettingsCard, SettingsSection } from '../settings/settings-section'
import { useAdminSearch } from './use-admin-search'

import type { AdminUser } from '@chinchi/shared'

const PAGE_SIZE = 50

const Badge = ({ children }: { children: string }) => (
  <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] font-semibold text-muted">
    {children}
  </span>
)

/** Everyone on the instance: search, suspend, and hand out admin rights. */
export const AdminUsersSection = () => {
  const { t } = useTranslation()
  const api = useApi()
  const me = useCurrentUser()
  const queryClient = useQueryClient()
  const search = useAdminSearch()
  const key = ['admin', 'users', search.query] as const
  const users = useInfiniteQuery({
    queryKey: key,
    queryFn: async ({ pageParam }) =>
      (
        await api.admin.users({
          ...(search.query ? { query: search.query } : {}),
          ...(pageParam ? { before: pageParam } : {}),
          limit: PAGE_SIZE,
        })
      ).users,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length === PAGE_SIZE ? page.at(-1)?.user.id : undefined),
  })
  const update = useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; suspended?: boolean; admin?: boolean }) =>
      api.admin.updateUser(userId, body),
    onSuccess: ({ user }) =>
      queryClient.setQueryData<{ pages: AdminUser[][]; pageParams: unknown[] }>(key, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) =>
                page.map((row) => (row.user.id === user.user.id ? user : row)),
              ),
            }
          : data,
      ),
  })
  const [confirming, setConfirming] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: (userId: string) => api.admin.deleteUser(userId),
    onSuccess: (_result, userId) => {
      setConfirming(null)
      queryClient.setQueryData<{ pages: AdminUser[][]; pageParams: unknown[] }>(key, (data) =>
        data
          ? { ...data, pages: data.pages.map((page) => page.filter((r) => r.user.id !== userId)) }
          : data,
      )
    },
  })
  const rows = users.data?.pages.flat() ?? []

  return (
    <SettingsSection title={t('admin.users.title')}>
      <input
        type="search"
        aria-label={t('admin.search')}
        placeholder={t('admin.users.searchPlaceholder')}
        value={search.text}
        onChange={(event) => search.setText(event.target.value)}
        className="rounded-md border border-border bg-rail px-3 py-2 outline-none focus:border-accent"
      />
      {update.isError || remove.isError ? (
        <Alert tone="error">{errorMessage(t, update.error ?? remove.error)}</Alert>
      ) : null}
      <SettingsCard>
        <ul aria-label={t('admin.users.title')} className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const name = row.user.username
            const self = row.user.id === me?.id
            return (
              <li key={row.user.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar
                  name={row.user.displayName ?? name}
                  src={row.user.avatarUrl}
                  id={row.user.id}
                  className="size-9"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    <span className="truncate">{row.user.displayName ?? name}</span>
                    {row.isAdmin ? <Badge>{t('admin.users.admin')}</Badge> : null}
                    {row.suspended ? <Badge>{t('admin.users.suspended')}</Badge> : null}
                    {row.mfaEnabled ? <Badge>2FA</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-muted">
                    @{name} · <span>{row.email}</span>
                  </p>
                </div>
                {self ? null : (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      fullWidth={false}
                      aria-label={t(
                        row.isAdmin ? 'admin.users.revokeAdmin' : 'admin.users.makeAdmin',
                        { name },
                      )}
                      onClick={() => update.mutate({ userId: row.user.id, admin: !row.isAdmin })}
                    >
                      {t(
                        row.isAdmin ? 'admin.users.revokeAdminShort' : 'admin.users.makeAdminShort',
                      )}
                    </Button>
                    <Button
                      variant={row.suspended ? 'secondary' : 'danger'}
                      fullWidth={false}
                      aria-label={t(
                        row.suspended ? 'admin.users.unsuspend' : 'admin.users.suspend',
                        { name },
                      )}
                      onClick={() =>
                        update.mutate({ userId: row.user.id, suspended: !row.suspended })
                      }
                    >
                      {t(row.suspended ? 'admin.users.unsuspendShort' : 'admin.users.suspendShort')}
                    </Button>
                    {confirming === row.user.id ? (
                      <>
                        <Button
                          variant="danger"
                          fullWidth={false}
                          pending={remove.isPending}
                          title={t('admin.users.deleteHint')}
                          aria-label={t('admin.users.confirmDelete', { name })}
                          onClick={() => remove.mutate(row.user.id)}
                        >
                          {t('admin.users.confirmDeleteShort')}
                        </Button>
                        <Button
                          variant="secondary"
                          fullWidth={false}
                          onClick={() => setConfirming(null)}
                        >
                          {t('admin.users.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="danger"
                        fullWidth={false}
                        aria-label={t('admin.users.delete', { name })}
                        onClick={() => setConfirming(row.user.id)}
                      >
                        {t('admin.users.deleteShort')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {!users.isPending && rows.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.nothingFound')}</p>
        ) : null}
        {users.hasNextPage ? (
          <div className="mt-3">
            <Button
              variant="secondary"
              pending={users.isFetchingNextPage}
              onClick={() => void users.fetchNextPage()}
            >
              {t('admin.more')}
            </Button>
          </div>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  )
}
