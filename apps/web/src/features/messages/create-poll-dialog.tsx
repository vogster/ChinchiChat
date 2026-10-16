import { POLL_ANSWERS_MAX, POLL_ANSWERS_MIN, POLL_DURATIONS_HOURS } from '@chinchi/shared'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Switch } from '../../components/ui/switch'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

import type { Snowflake } from '@chinchi/shared'

type Duration = (typeof POLL_DURATIONS_HOURS)[number]

/** Writes a poll and sends it as a message; it shows up through the gateway like any other. */
export const CreatePollDialog = ({
  channelId,
  onOpenChange,
}: {
  channelId: Snowflake
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<string[]>(['', ''])
  const [multiple, setMultiple] = useState(false)
  const [duration, setDuration] = useState<Duration>(24)
  const send = useMutation({
    mutationFn: () =>
      api.messages.create(channelId, {
        content: '',
        poll: {
          question: question.trim(),
          answers: answers.map((answer) => answer.trim()),
          multiple,
          durationHours: duration,
        },
      }),
    onSuccess: () => onOpenChange(false),
  })
  const ready = question.trim() !== '' && answers.every((answer) => answer.trim() !== '')

  return (
    <Dialog open onOpenChange={onOpenChange} title={t('polls.createTitle')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) send.mutate()
        }}
      >
        <TextField
          label={t('polls.question')}
          value={question}
          maxLength={300}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <div className="flex flex-col gap-2">
          {answers.map((answer, index) => (
            // Answers are edited in place; their position is their identity here.
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <TextField
                  label={t('polls.answer', { number: index + 1 })}
                  value={answer}
                  maxLength={55}
                  onChange={(event) =>
                    setAnswers((all) => all.map((a, i) => (i === index ? event.target.value : a)))
                  }
                />
              </div>
              {answers.length > POLL_ANSWERS_MIN ? (
                <button
                  type="button"
                  aria-label={t('polls.removeAnswer', { number: index + 1 })}
                  onClick={() => setAnswers((all) => all.filter((_, i) => i !== index))}
                  className="mb-2 rounded p-1 text-muted hover:text-text"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          {answers.length < POLL_ANSWERS_MAX ? (
            <Button
              variant="secondary"
              fullWidth={false}
              className="self-start"
              onClick={() => setAnswers((all) => [...all, ''])}
            >
              {t('polls.addAnswer')}
            </Button>
          ) : null}
        </div>
        <Switch
          checked={multiple}
          onCheckedChange={setMultiple}
          label={t('polls.multiple')}
          description={t('polls.multipleHint')}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {t('polls.duration')}
          </span>
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value) as Duration)}
            className="rounded-md border border-border bg-rail px-3 py-2 text-text"
          >
            {POLL_DURATIONS_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {t(`polls.durations.${hours}`)}
              </option>
            ))}
          </select>
        </label>
        {send.error ? <Alert tone="error">{errorMessage(t, send.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!ready} pending={send.isPending}>
            {t('polls.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
