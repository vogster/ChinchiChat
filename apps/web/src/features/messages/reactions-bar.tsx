import { useTranslation } from 'react-i18next'

import { EmojiGlyph } from '../emoji/custom-emoji'
import { emojiLabel } from '../emoji/expand-custom-emoji'

import type { Reaction } from '@chinchi/shared'

export interface ReactionsBarProps {
  readonly reactions: readonly Reaction[]
  readonly onToggle: (emoji: string) => void
}

/** The emoji under a message; click one to join it, or to take yours back. */
export const ReactionsBar = ({ reactions, onToggle }: ReactionsBarProps) => {
  const { t } = useTranslation()
  if (reactions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5 px-1">
      {reactions.map(({ emoji, count, me }) => (
        <li key={emoji}>
          <button
            type="button"
            aria-pressed={me}
            aria-label={t(me ? 'messages.reactionMine' : 'messages.reaction', {
              emoji: emojiLabel(emoji),
              count,
            })}
            onClick={() => onToggle(emoji)}
            className="flex h-7 items-center gap-1 rounded-full bg-field px-3 text-xs font-medium whitespace-nowrap text-muted transition hover:brightness-110 aria-pressed:bg-accent-soft aria-pressed:text-accent-text aria-pressed:shadow-[inset_0_0_0_1.5px_var(--zl-accent)]"
          >
            <span aria-hidden>
              <EmojiGlyph emoji={emoji} />
            </span>
            <span aria-hidden className="tabular-nums">
              · {count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
