import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CUSTOM_STATUS_TEXT_MAX } from '@chinchi/shared'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { setCustomStatusOf } from './queries'
import { useCustomStatus } from './use-custom-status'

import type { Snowflake } from '@chinchi/shared'

const DURATIONS = [
  { key: 'never', minutes: 0 },
  { key: '30m', minutes: 30 },
  { key: '1h', minutes: 60 },
  { key: '4h', minutes: 240 },
  { key: '24h', minutes: 1440 },
] as const

/** Sets or removes my custom status: an emoji, a few words, and when it should go away. */
export const CustomStatusDialog = ({
  userId,
  onClose,
}: {
  userId: Snowflake
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const current = useCustomStatus(userId)
  const durationId = useId()
  const [emoji, setEmoji] = useState(current?.emoji ?? '')
  const [text, setText] = useState(current?.text ?? '')
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]['key']>('never')

  const save = useMutation({
    mutationFn: () => {
      const minutes = DURATIONS.find((d) => d.key === duration)?.minutes ?? 0
      return api.users.setCustomStatus({
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
        ...(minutes > 0
          ? { expiresAt: new Date(Date.now() + minutes * 60_000).toISOString() }
          : {}),
      })
    },
    onSuccess: ({ customStatus }) => {
      setCustomStatusOf(queryClient, userId, customStatus)
      onClose()
    },
  })
  const clear = useMutation({
    mutationFn: () => api.users.clearCustomStatus(),
    onSuccess: () => {
      setCustomStatusOf(queryClient, userId, null)
      onClose()
    },
  })
  const error = save.error ?? clear.error

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('customStatus.title')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
        <div className="flex gap-3">
          <div className="w-24 shrink-0">
            <TextField
              label={t('customStatus.emoji')}
              value={emoji}
              maxLength={32}
              placeholder="🙂"
              onChange={(event) => setEmoji(event.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <TextField
              label={t('customStatus.text')}
              value={text}
              maxLength={CUSTOM_STATUS_TEXT_MAX}
              placeholder={t('customStatus.placeholder')}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={durationId}
            className="text-xs font-bold tracking-wide text-muted uppercase"
          >
            {t('customStatus.clearAfter')}
          </label>
          <select
            id={durationId}
            value={duration}
            onChange={(event) => setDuration(event.target.value as typeof duration)}
            className="rounded-md border border-border bg-rail px-3 py-2 text-text outline-none focus:border-accent"
          >
            {DURATIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {t(`customStatus.duration.${option.key}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {current ? (
            <Button
              variant="secondary"
              fullWidth={false}
              pending={clear.isPending}
              onClick={() => clear.mutate()}
            >
              {t('customStatus.clear')}
            </Button>
          ) : null}
          <Button
            type="submit"
            fullWidth={false}
            pending={save.isPending}
            disabled={!text.trim() && !emoji.trim()}
          >
            {t('customStatus.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
