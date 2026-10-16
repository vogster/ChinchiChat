import { BarChart3, Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { useNow } from '../../lib/use-now'
import { useCurrentUser } from '../auth/use-auth-actions'
import { usePollActions } from './use-polls'

import type { Poll } from '@chinchi/shared'

const HOUR = 3_600_000

/** "23 h left", "3 d left", "45 min left". */
const useTimeLeft = (expiresAt: string) => {
  const { t } = useTranslation()
  const left = Date.parse(expiresAt) - useNow()
  if (left >= 48 * HOUR) return t('polls.leftDays', { count: Math.floor(left / (24 * HOUR)) })
  if (left >= HOUR) return t('polls.leftHours', { count: Math.floor(left / HOUR) })
  return t('polls.leftMinutes', { count: Math.max(1, Math.ceil(left / 60_000)) })
}

const Results = ({ poll }: { poll: Poll }) => {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-1.5">
      {poll.answers.map((answer) => {
        const percent = poll.voters === 0 ? 0 : Math.round((answer.count / poll.voters) * 100)
        const label = `${answer.text}: ${percent}%, ${t('polls.votes', { count: answer.count })}${
          answer.me ? `, ${t('polls.yours')}` : ''
        }`
        return (
          <li key={answer.id}>
            <div
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              data-mine={answer.me}
              className="relative overflow-hidden rounded-md border border-border px-3 py-1.5 data-[mine=true]:border-accent"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 bg-accent/20"
                style={{ width: `${percent}%` }}
              />
              <span className="relative flex items-center gap-2 text-sm">
                {answer.me ? <Check aria-hidden className="size-4 text-accent" /> : null}
                <span className="min-w-0 flex-1 truncate">{answer.text}</span>
                <span className="text-muted">{percent}%</span>
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const Choices = ({
  poll,
  picked,
  onPick,
}: {
  poll: Poll
  picked: readonly number[]
  onPick: (ids: number[]) => void
}) => (
  <ul className="flex flex-col gap-1.5">
    {poll.answers.map((answer) => (
      <li key={answer.id}>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-hover has-checked:border-accent">
          <input
            type={poll.multiple ? 'checkbox' : 'radio'}
            name="poll-answer"
            checked={picked.includes(answer.id)}
            onChange={() =>
              onPick(
                poll.multiple
                  ? picked.includes(answer.id)
                    ? picked.filter((id) => id !== answer.id)
                    : [...picked, answer.id]
                  : [answer.id],
              )
            }
            className="accent-[var(--zl-accent)]"
          />
          {answer.text}
        </label>
      </li>
    ))}
  </ul>
)

/** A poll in a message: choose and vote, then see the results (as everyone does once it ends). */
export const PollCard = ({
  poll,
  channelId,
  messageId,
  authorId,
}: {
  poll: Poll
  channelId: string
  messageId: string
  authorId: string | null
}) => {
  const { t } = useTranslation()
  const isAuthor = useCurrentUser()?.id === authorId
  const { vote, end } = usePollActions(channelId, messageId)
  const voted = poll.answers.some((answer) => answer.me)
  const [changing, setChanging] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const timeLeft = useTimeLeft(poll.expiresAt)
  const choosing = !poll.ended && (!voted || changing)
  const error = vote.error ?? end.error

  return (
    <div
      role="group"
      aria-label={t('polls.label', { question: poll.question })}
      className="mt-1 flex max-w-md flex-col gap-3 rounded-lg border border-border bg-elevated p-3"
    >
      <div className="flex items-start gap-2">
        <BarChart3 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
        <div>
          <p className="font-semibold break-words">{poll.question}</p>
          <p className="text-xs text-muted">
            {poll.multiple ? t('polls.pickSeveral') : t('polls.pickOne')}
          </p>
        </div>
      </div>
      {choosing ? (
        <Choices poll={poll} picked={picked} onPick={setPicked} />
      ) : (
        <Results poll={poll} />
      )}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted">
          {t('polls.votes', { count: poll.voters })} · {poll.ended ? t('polls.ended') : timeLeft}
        </span>
        {choosing ? (
          <Button
            fullWidth={false}
            disabled={picked.length === 0}
            pending={vote.isPending}
            onClick={() =>
              vote.mutate(picked, {
                onSuccess: () => {
                  setChanging(false)
                  setPicked([])
                },
              })
            }
          >
            {t('polls.vote')}
          </Button>
        ) : null}
        {!poll.ended && voted && !changing ? (
          <Button variant="secondary" fullWidth={false} onClick={() => setChanging(true)}>
            {t('polls.change')}
          </Button>
        ) : null}
        {!poll.ended && voted ? (
          <Button
            variant="link"
            onClick={() => vote.mutate([], { onSuccess: () => setChanging(false) })}
          >
            {t('polls.unvote')}
          </Button>
        ) : null}
        {!poll.ended && isAuthor ? (
          <Button variant="link" pending={end.isPending} onClick={() => end.mutate()}>
            {t('polls.end')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
