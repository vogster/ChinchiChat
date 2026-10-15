import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@chinchi/sdk'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { SettingsCard, SettingsSection } from '../settings/settings-section'

import type { Report, ReportStatus } from '@chinchi/shared'

type Closing = 'resolved' | 'dismissed'

export interface ReportsListProps {
  /** Cache key prefix: one per server, one for the admins' DM reports. */
  readonly scope: readonly string[]
  readonly load: (status: ReportStatus) => Promise<{ reports: Report[] }>
  readonly close: (reportId: string, status: Closing) => Promise<unknown>
  /** Server moderators can delete the message; instance admins can't touch DMs. */
  readonly canDeleteMessages?: boolean
}

const STATUSES: readonly ReportStatus[] = ['open', 'resolved', 'dismissed']

/** Reports waiting for a decision: delete the message, mark resolved, or dismiss. */
export const ReportsList = ({ scope, load, close, canDeleteMessages = true }: ReportsListProps) => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ReportStatus>('open')
  const key = [...scope, 'reports', status]
  const { data, isPending } = useQuery({ queryKey: key, queryFn: () => load(status) })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [...scope, 'reports'] })
  const decide = useMutation({
    mutationFn: ({ report, verdict }: { report: Report; verdict: Closing }) =>
      close(report.id, verdict),
    onSuccess: refresh,
  })
  // The message may already be gone (deleted by its author): the report still gets resolved.
  const removeMessage = useMutation({
    mutationFn: async (report: Report) => {
      await api.messages.delete(report.channelId, report.messageId).catch((error: unknown) => {
        // Gone already is fine; anything else (no rights, offline) must not close the report.
        if (!(isApiError(error) && error.status === 404)) throw error
      })
      await close(report.id, 'resolved')
    },
    onSuccess: refresh,
  })
  const reports = data?.reports ?? []
  const error = decide.error ?? removeMessage.error
  const time = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    )

  return (
    <SettingsSection title={t('reports.listTitle')}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="reports-status"
          className="text-xs font-bold tracking-wide text-muted uppercase"
        >
          {t('reports.show')}
        </label>
        <select
          id="reports-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ReportStatus)}
          className="w-fit rounded-md border border-border bg-rail px-3 py-2"
        >
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`reports.statuses.${value}`)}
            </option>
          ))}
        </select>
      </div>
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <SettingsCard>
        {!isPending && reports.length === 0 ? (
          <p className="text-sm text-muted">{t(`reports.empty.${status}`)}</p>
        ) : null}
        <ul aria-label={t('reports.listTitle')} className="flex flex-col divide-y divide-border">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-col gap-2 py-3">
              <p className="text-xs text-muted">
                {t('reports.meta', {
                  reporter: report.reporter?.username ?? '—',
                  author: report.author?.username ?? '—',
                  time: time(report.createdAt),
                })}
              </p>
              <blockquote className="rounded border-l-4 border-border bg-rail px-3 py-2 text-sm break-words whitespace-pre-wrap">
                {report.content || t('reports.noText')}
              </blockquote>
              <p className="text-sm">
                <span className="font-semibold">{t(`reports.reasons.${report.reason}`)}</span>
                {report.details ? ` — ${report.details}` : ''}
              </p>
              {report.status === 'open' ? (
                <div className="flex flex-wrap gap-2">
                  {canDeleteMessages ? (
                    <Button
                      variant="danger"
                      fullWidth={false}
                      pending={removeMessage.isPending && removeMessage.variables?.id === report.id}
                      onClick={() => removeMessage.mutate(report)}
                    >
                      {t('reports.deleteMessage')}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    onClick={() => decide.mutate({ report, verdict: 'resolved' })}
                  >
                    {t('reports.resolve')}
                  </Button>
                  <Button
                    variant="secondary"
                    fullWidth={false}
                    onClick={() => decide.mutate({ report, verdict: 'dismissed' })}
                  >
                    {t('reports.dismiss')}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  {t('reports.closedBy', { name: report.resolvedBy?.username ?? '—' })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SettingsSection>
  )
}
