import { AtSign, Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'

import type { MentionCandidate } from './mention-query'

const roleColor = (color: number | undefined) =>
  color ? `#${color.toString(16).padStart(6, '0')}` : undefined

const Icon = ({ candidate }: { candidate: MentionCandidate }) => {
  if (candidate.user) {
    return (
      <Avatar
        name={candidate.label}
        src={candidate.user.avatarUrl}
        id={candidate.user.id}
        className="size-6"
      />
    )
  }
  if (candidate.kind === 'channel') {
    return <Hash aria-hidden className="size-5 shrink-0 text-muted" />
  }
  return (
    <AtSign
      aria-hidden
      className="size-5 shrink-0 text-muted"
      style={{ color: roleColor(candidate.color) }}
    />
  )
}

/** People, roles or channels matching what is typed after `@` or `#`, above the composer. */
export const MentionSuggestions = ({
  candidates,
  active,
  onPick,
}: {
  candidates: readonly MentionCandidate[]
  /** Index of the highlighted one (arrows move it, Enter or Tab picks it). */
  active: number
  onPick: (candidate: MentionCandidate) => void
}) => {
  const { t } = useTranslation()
  return (
    <ul
      role="listbox"
      aria-label={t('mentions.suggestions')}
      className="mb-1 flex max-h-64 flex-col overflow-y-auto rounded-lg border border-line bg-side py-1"
    >
      {candidates.map((candidate, index) => (
        <li
          key={candidate.key}
          role="option"
          aria-selected={index === active}
          aria-label={
            candidate.detail ? `${candidate.label}, ${candidate.detail}` : candidate.label
          }
          // Keeps focus in the composer while picking with the mouse.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(candidate)}
          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-field aria-selected:bg-field"
        >
          <Icon candidate={candidate} />
          <span className="truncate font-semibold">{candidate.label}</span>
          {candidate.detail ? (
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{candidate.detail}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
