import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { formatRelativeTime } from '../../lib/relative-time'
import { authKeys, sessionsQueryOptions } from '../auth/queries'
import { describeUserAgent } from './user-agent'

import type { SessionInfo } from '@chinchi/shared'

const SessionRow = ({
  session,
  onRevoke,
  revoking,
}: {
  session: SessionInfo
  onRevoke: (id: string) => void
  revoking: boolean
}) => {
  const { t, i18n } = useTranslation()
  const device = describeUserAgent(session.userAgent) ?? t('settings.sessions.unknownDevice')

  return (
    <li className="flex items-center gap-3 py-3">
      <Monitor aria-hidden className="size-8 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{device}</span>
          {session.current ? (
            <span className="rounded bg-green-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {t('settings.sessions.current')}
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted">
          {[
            session.ipAddress,
            t('settings.sessions.lastActive', {
              time: formatRelativeTime(session.lastUsedAt, i18n.language),
            }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {session.current ? null : (
        <Button
          variant="link"
          aria-label={t('settings.sessions.revokeLabel', { device })}
          pending={revoking}
          onClick={() => onRevoke(session.id)}
        >
          {t('settings.sessions.revoke')}
        </Button>
      )}
    </li>
  )
}

export const SessionsList = () => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const { data: sessions } = useSuspenseQuery(sessionsQueryOptions(api))

  const refresh = () => queryClient.invalidateQueries({ queryKey: authKeys.sessions })
  const revoke = useMutation({
    mutationFn: (id: string) => api.sessions.revoke(id),
    onSettled: refresh,
  })
  const revokeOthers = useMutation({
    mutationFn: () => api.sessions.revokeOthers(),
    onSettled: refresh,
  })

  const others = sessions.filter((session) => !session.current)
  const error = revoke.error ?? revokeOthers.error

  return (
    <div className="flex flex-col gap-4">
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      {revokeOthers.isSuccess && others.length === 0 ? (
        <Alert tone="success">{t('settings.sessions.revokedOthers')}</Alert>
      ) : null}

      <ul
        className="divide-y divide-border rounded-lg bg-sidebar px-4"
        aria-label={t('settings.sessions.title')}
      >
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onRevoke={(id) => revoke.mutate(id)}
            revoking={revoke.isPending && revoke.variables === session.id}
          />
        ))}
      </ul>

      {others.length > 0 ? (
        <Button
          variant="danger"
          className="sm:w-auto sm:self-start"
          pending={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          {t('settings.sessions.revokeOthers')}
        </Button>
      ) : (
        <p className="text-sm text-muted">{t('settings.sessions.empty')}</p>
      )}
    </div>
  )
}
