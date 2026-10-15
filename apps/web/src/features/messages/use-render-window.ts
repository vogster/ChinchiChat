import { useEffect, useRef, useState } from 'react'

import { REVEAL_MESSAGE_EVENT } from './jump-to-message'

import type { MessageRow } from './group-messages'

/** Rows kept in the page at the newest end; enough for a few screens of scrolling. */
export const RENDER_BASE = 150
const RENDER_STEP = 100

/** The first row shown always gets its header, even if it continues a hidden author run. */
const withHeader = (rows: readonly MessageRow[]): MessageRow[] => {
  const [first, ...rest] = rows
  if (!first || first.kind !== 'message' || !first.compact) return [...rows]
  return [{ ...first, compact: false }, ...rest]
}

/**
 * Renders only the newest rows of a long history. Older loaded rows come back as the reader
 * scrolls up (no request), and the window shrinks again once they return to the bottom, so
 * the page doesn't keep every message ever loaded. Jumps to a hidden message widen it.
 */
export const useRenderWindow = (channelId: string, rows: readonly MessageRow[]) => {
  const [state, setState] = useState({ channelId, count: RENDER_BASE })
  const count = state.channelId === channelId ? state.count : RENDER_BASE
  const hidden = Math.max(rows.length - count, 0)

  const latest = useRef({ rows, count })
  useEffect(() => {
    latest.current = { rows, count }
  })

  useEffect(() => {
    const onReveal = (event: Event) => {
      const messageId = (event as CustomEvent<string>).detail
      const { rows: current, count: shown } = latest.current
      const index = current.findIndex((r) => r.kind === 'message' && r.message.id === messageId)
      // A little context above the target, so it doesn't land at the very edge.
      if (index >= 0) setState({ channelId, count: Math.max(shown, current.length - index + 20) })
    }
    window.addEventListener(REVEAL_MESSAGE_EVENT, onReveal)
    return () => window.removeEventListener(REVEAL_MESSAGE_EVENT, onReveal)
  }, [channelId])

  return {
    rows: withHeader(rows.slice(hidden)),
    /** Loaded rows not in the page (shown again before loading more history). */
    hidden,
    showOlder: () => setState({ channelId, count: count + RENDER_STEP }),
    shrink: () => {
      if (count !== RENDER_BASE) setState({ channelId, count: RENDER_BASE })
    },
  }
}
