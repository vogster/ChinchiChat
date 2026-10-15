import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

import type { Snowflake } from '@chinchi/shared'

export type ModerationKind = 'timeout' | 'kick' | 'ban'

const TIMEOUTS = [
  { key: 'minute', ms: 60_000 },
  { key: 'fiveMinutes', ms: 5 * 60_000 },
  { key: 'tenMinutes', ms: 10 * 60_000 },
  { key: 'hour', ms: 60 * 60_000 },
  { key: 'day', ms: 24 * 60 * 60_000 },
  { key: 'week', ms: 7 * 24 * 60 * 60_000 },
] as const

const DELETE_WINDOWS = [
  { key: 'none', seconds: 0 },
  { key: 'hour', seconds: 3600 },
  { key: 'day', seconds: 86_400 },
  { key: 'week', seconds: 604_800 },
] as const

/** Timeout, kick or ban one member, each with an optional reason for the audit log. */
export const ModerationDialog = ({
  kind,
  guildId,
  userId,
  name,
  onOpenChange,
}: {
  kind: ModerationKind
  guildId: Snowflake
  userId: Snowflake
  name: string
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<number>(TIMEOUTS[2].ms)
  const [deleteSeconds, setDeleteSeconds] = useState(0)
  const act = useMutation({
    mutationFn: async () => {
      const why = reason.trim() || undefined
      if (kind === 'timeout') {
        const until = new Date(Date.now() + duration).toISOString()
        return api.moderation.timeout(guildId, userId, { until, ...(why ? { reason: why } : {}) })
      }
      if (kind === 'kick') return api.moderation.kick(guildId, userId, why)
      return api.moderation.ban(guildId, userId, {
        ...(why ? { reason: why } : {}),
        deleteMessageSeconds: deleteSeconds,
      })
    },
    onSuccess: () => onOpenChange(false),
  })

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t(`moderation.${kind}.title`, { name })}
      description={t(`moderation.${kind}.text`)}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          act.mutate()
        }}
      >
        {kind === 'timeout' ? (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">{t('moderation.timeout.duration')}</legend>
            {TIMEOUTS.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-center gap-2 rounded-md bg-elevated px-3 py-2 text-sm has-[:checked]:outline-2 has-[:checked]:outline-accent"
              >
                <input
                  type="radio"
                  name="timeout-duration"
                  checked={duration === option.ms}
                  onChange={() => setDuration(option.ms)}
                  className="accent-[var(--zl-accent)]"
                />
                {t(`moderation.durations.${option.key}`)}
              </label>
            ))}
          </fieldset>
        ) : null}
        {kind === 'ban' ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ban-delete"
              className="text-xs font-bold tracking-wide text-muted uppercase"
            >
              {t('moderation.ban.deleteMessages')}
            </label>
            <select
              id="ban-delete"
              value={deleteSeconds}
              onChange={(event) => setDeleteSeconds(Number(event.target.value))}
              className="rounded-md border border-border bg-rail px-3 py-2"
            >
              {DELETE_WINDOWS.map((option) => (
                <option key={option.key} value={option.seconds}>
                  {t(`moderation.ban.windows.${option.key}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <TextField
          label={t('moderation.reason')}
          value={reason}
          maxLength={512}
          onChange={(event) => setReason(event.target.value)}
        />
        {act.isError ? <Alert tone="error">{errorMessage(t, act.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant={kind === 'timeout' ? 'primary' : 'danger'}
            pending={act.isPending}
          >
            {t(`moderation.${kind}.confirm`)}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
