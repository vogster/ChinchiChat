import { useInfiniteQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { AuditLogEntry, GuildDetail, PublicUser } from '@chinchi/shared'

const PAGE_SIZE = 50

const userName = (user: PublicUser | null, fallback = '—') =>
  user ? (user.displayName ?? user.username) : fallback

/** What the entry was about when it isn't a person: a channel, a role, the server. */
const subjectName = (entry: AuditLogEntry, guild: GuildDetail, hidden: string) => {
  const named = typeof entry.data.name === 'string' ? entry.data.name : null
  if (named) return named
  const role = guild.roles.find((r) => r.id === entry.targetId)
  // The server leaves out channels the viewer can't see.
  return role?.name ?? entry.targetId ?? hidden
}

const formatTime = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )

/** The server's journal of moderation and settings changes, newest first. */
export const AuditLogSection = ({ guild }: { guild: GuildDetail }) => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const log = useInfiniteQuery({
    queryKey: ['guilds', guild.id, 'audit-log'],
    queryFn: async ({ pageParam }) =>
      (await api.moderation.auditLog(guild.id, { before: pageParam, limit: PAGE_SIZE })).entries,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => (page.length === PAGE_SIZE ? page.at(-1)?.id : undefined),
  })
  const entries = log.data?.pages.flat() ?? []

  return (
    <SettingsSection title={t('serverSettings.auditLog.title')}>
      {log.isError ? <Alert tone="error">{errorMessage(t, log.error)}</Alert> : null}
      <SettingsCard>
        {log.isPending ? (
          <p className="text-sm text-muted">{t('common.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">{t('serverSettings.auditLog.empty')}</p>
        ) : (
          <ul
            aria-label={t('serverSettings.auditLog.title')}
            className="flex flex-col divide-y divide-line"
          >
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3 py-3">
                <Avatar
                  name={userName(entry.actor)}
                  src={entry.actor?.avatarUrl ?? null}
                  id={entry.actor?.id}
                  className="size-8"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words">
                    {t(`serverSettings.auditLog.actions.${entry.action}`, {
                      // No actor: the server acted on its own (automod).
                      actor: userName(entry.actor, t('serverSettings.auditLog.automod')),
                      target: userName(entry.targetUser),
                      subject: subjectName(entry, guild, t('serverSettings.auditLog.hidden')),
                    })}
                  </p>
                  {entry.reason ? (
                    <p className="text-sm break-words text-muted">{entry.reason}</p>
                  ) : null}
                  <p className="text-xs text-muted">
                    <time dateTime={entry.createdAt}>
                      {formatTime(entry.createdAt, i18n.language)}
                    </time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {log.hasNextPage ? (
          <div className="mt-3">
            <Button
              variant="secondary"
              pending={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              {t('serverSettings.auditLog.more')}
            </Button>
          </div>
        ) : null}
      </SettingsCard>
    </SettingsSection>
  )
}
