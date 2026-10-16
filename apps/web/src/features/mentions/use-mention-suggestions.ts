import { useState } from 'react'

import { applyMention, findMentionQuery, matchMentions } from './mention-query'

import type { MentionCandidate } from './mention-query'
import type { KeyboardEvent, RefObject } from 'react'

/**
 * Mention suggestions for a textarea: what is typed after `@` or `#` before the caret, the
 * matching candidates and the keys that move through and pick them.
 */
export const useMentionSuggestions = ({
  value,
  candidates,
  ref,
  onChange,
}: {
  value: string
  candidates: readonly MentionCandidate[] | null
  ref: RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
}) => {
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  /** Esc hides the list until the text changes. */
  const [dismissed, setDismissed] = useState<string | null>(null)

  const query = candidates && dismissed !== value ? findMentionQuery(value, caret) : null
  const matches = query && candidates ? matchMentions(candidates, query) : []
  const index = Math.min(active, Math.max(matches.length - 1, 0))

  /** Keeps track of the caret: call on change and selection changes. */
  const track = () => {
    setCaret(ref.current?.selectionStart ?? value.length)
    setActive(0)
  }

  const pick = (candidate: MentionCandidate) => {
    if (!query) return
    const next = applyMention(value, query, candidate)
    onChange(next.value)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  /** Arrows, Enter, Tab and Esc while the list is open; true when the key was used. */
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (matches.length === 0) return false
    const picked = matches[index]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : matches.length - 1
      setActive((index + step) % matches.length)
    } else if ((event.key === 'Enter' || event.key === 'Tab') && picked && !event.shiftKey) {
      pick(picked)
    } else if (event.key === 'Escape') {
      setDismissed(value)
    } else {
      return false
    }
    event.preventDefault()
    return true
  }

  return { matches, active: index, track, pick, onKey }
}
