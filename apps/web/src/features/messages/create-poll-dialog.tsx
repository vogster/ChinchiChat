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
  const [anonymous, setAnonymous] = useState(false)
  const [duration, setDuration] = useState<Duration>(24)
  const send = useMutation({
    mutationFn: () =>
      api.messages.create(channelId, {
        content: '',
        poll: {
          question: question.trim(),
          answers: answers.map((answer) => answer.trim()),
          multiple,
          anonymous,
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
        <fieldset className="flex flex-col gap-1.5">
          <legend className="px-1.5 pb-1.5 text-[12.5px] font-medium text-faint">
            {t('polls.answers')}
          </legend>
          {answers.map((answer, index) => (
            // Answers are edited in place; their position is their identity here.
            <div key={index} className="relative">
              <input
                aria-label={t('polls.answer', { number: index + 1 })}
                placeholder={t('polls.answer', { number: index + 1 })}
                value={answer}
                maxLength={55}
                onChange={(event) =>
                  setAnswers((all) => all.map((a, i) => (i === index ? event.target.value : a)))
                }
                className="h-11 w-full rounded-field bg-field pr-11 pl-3.5 text-text outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
              />
              {answers.length > POLL_ANSWERS_MIN ? (
                <button
                  type="button"
                  aria-label={t('polls.removeAnswer', { number: index + 1 })}
                  onClick={() => setAnswers((all) => all.filter((_, i) => i !== index))}
                  className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full text-muted hover:bg-chip hover:text-text"
                >
                  <X aria-hidden className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
          {answers.length < POLL_ANSWERS_MAX ? (
            <button
              type="button"
              onClick={() => setAnswers((all) => [...all, ''])}
              className="h-11 rounded-field border-[1.5px] border-dashed border-chip text-[13px] font-medium text-muted transition-colors hover:border-faint hover:text-text"
            >
              <span aria-hidden>+ </span>
              {t('polls.addAnswer')}
            </button>
          ) : null}
        </fieldset>
        <Switch
          checked={multiple}
          onCheckedChange={setMultiple}
          label={t('polls.multiple')}
          description={t('polls.multipleHint')}
        />
        <Switch
          checked={anonymous}
          onCheckedChange={setAnonymous}
          label={t('polls.anonymousSwitch')}
          description={t('polls.anonymousHint')}
        />
        <label className="flex flex-col gap-1.5">
          <span className="px-1.5 text-[12.5px] font-medium text-faint">{t('polls.duration')}</span>
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value) as Duration)}
            className="h-11 rounded-field bg-field px-3.5 text-text outline-none focus:ring-2 focus:ring-accent"
          >
            {POLL_DURATIONS_HOURS.map((hours) => (
              <option key={hours} value={hours}>
                {t(`polls.durations.${hours}`)}
              </option>
            ))}
          </select>
        </label>
        {send.error ? <Alert tone="error">{errorMessage(t, send.error)}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" fullWidth={false} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" fullWidth={false} disabled={!ready} pending={send.isPending}>
            {t('polls.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
