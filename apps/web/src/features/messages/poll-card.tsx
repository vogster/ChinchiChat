import { BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { errorMessage } from '../../lib/errors'
import { useNow } from '../../lib/use-now'
import { useCurrentUser } from '../auth/use-auth-actions'
import { PickOne, PickSeveral, Results } from './poll-answers'
import { usePollActions } from './use-polls'

import type { Poll } from '@chinchi/shared'

const HOUR = 3_600_000

// Colours go with each button: one text colour per element (see AGENTS.md, Tailwind).
const footerButton =
  'h-7 shrink-0 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-60'
const quietButton = `${footerButton} text-muted hover:bg-stage hover:text-text`

/** "23 h left", "3 d left", "45 min left". */
const useTimeLeft = (expiresAt: string) => {
  const { t } = useTranslation()
  const left = Date.parse(expiresAt) - useNow()
  if (left >= 48 * HOUR) return t('polls.leftDays', { count: Math.floor(left / (24 * HOUR)) })
  if (left >= HOUR) return t('polls.leftHours', { count: Math.floor(left / HOUR) })
  return t('polls.leftMinutes', { count: Math.max(1, Math.ceil(left / 60_000)) })
}

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
  // Single choice votes on a click and re-votes from the results; several answers need a button.
  const choosing = !poll.ended && (!voted || changing)
  const error = vote.error ?? end.error
  const castVote = (ids: number[]) =>
    vote.mutate(ids, {
      onSuccess: () => {
        setChanging(false)
        setPicked([])
      },
    })

  return (
    <div
      role="group"
      aria-label={t('polls.label', { question: poll.question })}
      className="flex w-[min(440px,100%)] flex-col gap-2.5 rounded-card bg-field p-3.5 text-left text-text"
    >
      <div className="flex flex-col gap-1.5 px-1 pt-0.5">
        <span
          className={`flex items-center gap-1.5 text-xs font-medium ${poll.ended ? 'text-faint' : 'text-accent-text'}`}
        >
          <BarChart3 aria-hidden className="size-3.5" />
          {[
            poll.ended
              ? t('polls.ended')
              : poll.multiple
                ? t('polls.kindSeveral')
                : t('polls.kindOne'),
            poll.anonymous ? t('polls.anonymous') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <p className="text-base leading-snug font-semibold text-pretty break-words">
          {poll.question}
        </p>
      </div>
      {choosing && poll.multiple ? (
        <PickSeveral poll={poll} picked={picked} onPick={setPicked} />
      ) : choosing ? (
        <PickOne poll={poll} onVote={(id) => castVote([id])} />
      ) : (
        <Results
          poll={poll}
          channelId={channelId}
          messageId={messageId}
          onRevote={!poll.ended && !poll.multiple ? (id) => castVote([id]) : null}
        />
      )}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[12.5px] text-faint">
        <span className="mr-auto min-w-0">
          {[
            t('polls.votes', { count: poll.voters }),
            voted ? t('polls.youVoted') : null,
            poll.ended ? null : timeLeft,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {choosing && poll.multiple ? (
          <Button
            fullWidth={false}
            disabled={picked.length === 0}
            pending={vote.isPending}
            onClick={() => castVote(picked)}
          >
            {t('polls.vote')}
          </Button>
        ) : null}
        {!poll.ended && voted && poll.multiple && !changing ? (
          <button type="button" onClick={() => setChanging(true)} className={quietButton}>
            {t('polls.change')}
          </button>
        ) : null}
        {!poll.ended && voted ? (
          <button type="button" onClick={() => castVote([])} className={quietButton}>
            {t('polls.unvote')}
          </button>
        ) : null}
        {!poll.ended && isAuthor ? (
          <button
            type="button"
            disabled={end.isPending}
            onClick={() => end.mutate()}
            className={`${footerButton} text-danger hover:bg-danger-soft`}
          >
            {t('polls.end')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
