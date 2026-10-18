import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Poll } from '@chinchi/shared'

const rowClass =
  'relative flex min-h-[46px] w-full items-center gap-2.5 overflow-hidden rounded-tile bg-stage py-2 pr-3.5 pl-3 text-left'

/** The round mark of an answer: an empty ring, or the accent with a tick when it is yours. */
const Mark = ({ mine }: { mine: boolean }) => (
  <span
    aria-hidden
    data-mine={mine}
    className="relative grid size-5 shrink-0 place-items-center rounded-full text-accent-contrast shadow-[inset_0_0_0_2px_var(--zl-faint)] data-[mine=true]:bg-accent data-[mine=true]:shadow-none"
  >
    {mine ? <Check className="size-3" strokeWidth={3} /> : null}
  </span>
)

/** Single choice before voting: picking an answer is the vote. */
export const PickOne = ({ poll, onVote }: { poll: Poll; onVote: (id: number) => void }) => (
  <ul className="flex flex-col gap-1.5">
    {poll.answers.map((answer) => (
      <li key={answer.id}>
        <button
          type="button"
          onClick={() => onVote(answer.id)}
          className={`${rowClass} transition hover:brightness-110`}
        >
          <Mark mine={false} />
          <span className="relative min-w-0 flex-1 leading-tight">{answer.text}</span>
        </button>
      </li>
    ))}
  </ul>
)

/** Several answers: tick some, then vote with the card's button. */
export const PickSeveral = ({
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
        <label
          className={`${rowClass} cursor-pointer transition hover:brightness-110 has-checked:shadow-[inset_0_0_0_1.5px_var(--zl-accent)]`}
        >
          <input
            type="checkbox"
            checked={picked.includes(answer.id)}
            onChange={() =>
              onPick(
                picked.includes(answer.id)
                  ? picked.filter((id) => id !== answer.id)
                  : [...picked, answer.id],
              )
            }
            className="size-4 shrink-0 accent-[var(--zl-accent)]"
          />
          <span className="min-w-0 flex-1 leading-tight">{answer.text}</span>
        </label>
      </li>
    ))}
  </ul>
)

/**
 * After voting (or once it ends): a bar per answer, yours ringed in the accent. While the poll
 * runs, a single-choice answer can be picked again from here.
 */
export const Results = ({
  poll,
  onRevote,
}: {
  poll: Poll
  onRevote: ((id: number) => void) | null
}) => {
  const { t } = useTranslation()
  const top = Math.max(...poll.answers.map((answer) => answer.count))
  return (
    <ul className="flex flex-col gap-1.5">
      {poll.answers.map((answer) => {
        const percent = poll.voters === 0 ? 0 : Math.round((answer.count / poll.voters) * 100)
        const label = `${answer.text}: ${percent}%, ${t('polls.votes', { count: answer.count })}${
          answer.me ? `, ${t('polls.yours')}` : ''
        }`
        const winner = poll.ended && answer.count > 0 && answer.count === top
        return (
          <li key={answer.id} className="relative">
            <div
              role="meter"
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              data-mine={answer.me}
              className={`${rowClass} data-[mine=true]:shadow-[inset_0_0_0_1.5px_var(--zl-accent)]`}
            >
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 rounded-tile transition-[width] duration-600 ease-[cubic-bezier(.2,.8,.2,1)] ${answer.me ? 'bg-[color-mix(in_oklch,var(--zl-accent)_34%,transparent)]' : winner ? 'bg-accent-soft' : 'bg-chip'}`}
                style={{ width: `${percent}%` }}
              />
              <Mark mine={answer.me} />
              <span
                className={`relative min-w-0 flex-1 leading-tight ${answer.me || winner ? 'font-semibold' : ''}`}
              >
                {answer.text}
              </span>
              <span className="relative min-w-[38px] shrink-0 text-right text-[13px] font-semibold">
                {percent}%
              </span>
            </div>
            {onRevote && !answer.me ? (
              <button
                type="button"
                aria-label={t('polls.voteFor', { answer: answer.text })}
                onClick={() => onRevote(answer.id)}
                className="absolute inset-0 rounded-tile hover:bg-text/5"
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
