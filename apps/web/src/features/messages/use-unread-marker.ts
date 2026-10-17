import { compareSnowflakes } from '@chinchi/shared'
import { useCallback, useState } from 'react'

import { useReadStates } from './use-messages'

import type { MessageItem } from './queries'
import type { Snowflake } from '@chinchi/shared'

export interface UnreadMarker {
  /** The first new message from someone else, if it is loaded. */
  readonly firstUnreadId: Snowflake | null
  /** Where reading stopped when the channel was opened. */
  readonly lastReadId: Snowflake | null
  /** New messages from others among the loaded ones. */
  readonly count: number
  /** Older history (not loaded yet) holds more of them. */
  readonly more: boolean
  /** The "N new messages" banner; it goes once the first of them has been on screen. */
  readonly bannerShown: boolean
  readonly hideBanner: () => void
  readonly dismiss: () => void
}

const isAfter = (id: Snowflake, than: Snowflake) => compareSnowflakes(id, than) > 0

/**
 * Where the new messages started when the channel was opened. Opening it marks everything read
 * at once, so the position is remembered then and stays put while more messages arrive; it goes
 * away when dismissed or once the user writes something.
 */
export const useUnreadMarker = (
  channelId: Snowflake,
  messages: readonly MessageItem[],
  myId: Snowflake | undefined,
  hasOlder: boolean,
): UnreadMarker => {
  const readStates = useReadStates()
  const [opened, setOpened] = useState<{
    lastRead: Snowflake | null
    newest: Snowflake | null
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const dismiss = () => setDismissed(true)
  const [bannerShown, setBannerShown] = useState(true)
  const hideBanner = useCallback(() => setBannerShown(false), [])

  // Taken during render, before the effect that marks the channel read runs.
  if (opened === null && readStates !== undefined && messages.length > 0) {
    setOpened({ lastRead: readStates[channelId] ?? null, newest: messages.at(-1)?.id ?? null })
  }

  const none = {
    firstUnreadId: null,
    lastReadId: null,
    count: 0,
    more: false,
    bannerShown: false,
    hideBanner,
    dismiss,
  }
  // A channel never opened before has no marker: all of it would be "new".
  if (!opened?.lastRead || dismissed) return none
  const { lastRead, newest } = opened
  const wroteSince = messages.some(
    (m) => m.author?.id === myId && (m.pending || (newest !== null && isAfter(m.id, newest))),
  )
  if (wroteSince) return none

  const unread = messages.filter(
    (m) => !m.pending && !m.system && m.author?.id !== myId && isAfter(m.id, lastRead),
  )
  const oldest = messages[0]
  const more = hasOlder && oldest !== undefined && isAfter(oldest.id, lastRead)
  if (unread.length === 0) return none
  return {
    firstUnreadId: more ? null : (unread[0]?.id ?? null),
    lastReadId: lastRead,
    count: unread.length,
    more,
    bannerShown,
    hideBanner,
    dismiss,
  }
}
