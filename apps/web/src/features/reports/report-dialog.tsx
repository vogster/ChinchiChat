import { REPORT_DETAILS_MAX_LENGTH, reportReasonSchema } from '@chinchi/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

import type { ReportReason, Snowflake } from '@chinchi/shared'

/** Reporting a message to the server's moderators (or, in DMs, the instance admins). */
export const ReportDialog = ({
  channelId,
  messageId,
  onClose,
}: {
  channelId: Snowflake
  messageId: Snowflake
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')
  const send = useMutation({
    mutationFn: () =>
      api.reports.create(channelId, messageId, {
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      }),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('reports.title')}>
      {send.isSuccess ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t('reports.sent')}</p>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            send.mutate()
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm">{t('reports.why')}</legend>
            {reportReasonSchema.options.map((option) => (
              <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="report-reason"
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="accent-[var(--zl-accent)]"
                />
                {t(`reports.reasons.${option}`)}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="report-details"
              className="text-xs font-bold tracking-wide text-muted uppercase"
            >
              {t('reports.details')}
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={REPORT_DETAILS_MAX_LENGTH}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="resize-none rounded-md border border-border bg-rail px-3 py-2 outline-none focus:border-accent"
            />
          </div>
          {send.isError ? <Alert tone="error">{errorMessage(t, send.error)}</Alert> : null}
          <Button type="submit" pending={send.isPending}>
            {t('reports.send')}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
