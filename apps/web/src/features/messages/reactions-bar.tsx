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
    <ul className="mt-1 flex flex-wrap gap-1">
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
            className="flex items-center gap-1 rounded-md border border-transparent bg-elevated px-1.5 py-0.5 text-sm hover:border-border aria-pressed:border-accent aria-pressed:bg-accent/15"
          >
            <span aria-hidden>
              <EmojiGlyph emoji={emoji} />
            </span>
            <span aria-hidden className="text-xs font-semibold tabular-nums">
              {count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
