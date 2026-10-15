import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { SettingsCard, SettingsSection } from '../settings/settings-section'
import { useAdminSearch } from './use-admin-search'

import type { AdminGuild } from '@chinchi/shared'

const PAGE_SIZE = 50

/** Every server on the instance, with its owner and size; admins can delete any of them. */
export const AdminGuildsSection = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const search = useAdminSearch()
  const [deleting, setDeleting] = useState<AdminGuild | null>(null)
  const guilds = useInfiniteQuery({
    queryKey: ['admin', 'guilds', search.query],
    queryFn: async ({ pageParam }) =>
      (
        await api.admin.guilds({
          ...(search.query ? { query: search.query } : {}),
          ...(pageParam ? { before: pageParam } : {}),
          limit: PAGE_SIZE,
        })
      ).guilds,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length === PAGE_SIZE ? page.at(-1)?.id : undefined),
  })
  const remove = useMutation({
    mutationFn: (guildId: string) => api.admin.deleteGuild(guildId),
    onSuccess: () => {
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'guilds'] })
    },
  })
  const rows = guilds.data?.pages.flat() ?? []

  return (
    <SettingsSection title={t('admin.guilds.title')}>
      <input
        type="search"
        aria-label={t('admin.search')}
        placeholder={t('admin.guilds.searchPlaceholder')}
        value={search.text}
        onChange={(event) => search.setText(event.target.value)}
        className="rounded-md border border-border bg-rail px-3 py-2 outline-none focus:border-accent"
      />
      <SettingsCard>
        <ul aria-label={t('admin.guilds.title')} className="flex flex-col divide-y divide-border">
          {rows.map((guild) => (
            <li key={guild.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{guild.name}</p>
                <p className="truncate text-sm text-muted">
                  {t('admin.guilds.owner', {
                    name: guild.owner ? guild.owner.username : '—',
                  })}{' '}
                  · {t('admin.guilds.members', { count: guild.memberCount })}
                </p>
              </div>
              <Button
                variant="danger"
                fullWidth={false}
                aria-label={t('admin.guilds.delete', { name: guild.name })}
                onClick={() => setDeleting(guild)}
              >
                {t('admin.guilds.deleteShort')}
              </Button>
            </li>
          ))}
        </ul>
        {!guilds.isPending && rows.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.nothingFound')}</p>
        ) : null}
        {guilds.hasNextPage ? (
          <div className="mt-3">
            <Button
              variant="secondary"
              pending={guilds.isFetchingNextPage}
              onClick={() => void guilds.fetchNextPage()}
            >
              {t('admin.more')}
            </Button>
          </div>
        ) : null}
      </SettingsCard>
      {deleting ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title={t('admin.guilds.confirmTitle', { name: deleting.name })}
          description={t('admin.guilds.confirmText')}
        >
          <div className="flex flex-col gap-3">
            {remove.isError ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                pending={remove.isPending}
                onClick={() => remove.mutate(deleting.id)}
              >
                {t('admin.guilds.confirm')}
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </SettingsSection>
  )
}
