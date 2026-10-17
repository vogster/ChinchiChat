import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { jumpWhenRendered, revealMessage } from './reveal-message'

import type { UnreadMarker } from './use-unread-marker'
import type { Snowflake } from '@chinchi/shared'

/** "3 new messages": jump to the first one, or dismiss the marker. */
export const UnreadBanner = ({
  channelId,
  marker,
}: {
  channelId: Snowflake
  marker: UnreadMarker
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  if (marker.count === 0 || !marker.bannerShown) return null

  const jump = async () => {
    const shown = marker.firstUnreadId
      ? await jumpWhenRendered(marker.firstUnreadId)
      : // Past the loaded history: page back to where reading stopped.
        marker.lastReadId !== null &&
        (await revealMessage(queryClient, api, channelId, marker.lastReadId))
    if (shown) marker.hideBanner()
  }

  return (
    <div className="absolute inset-x-4 top-2 z-10 flex items-center gap-3 rounded-md bg-accent px-3 py-1.5 text-sm text-accent-contrast shadow-lg">
      <span className="min-w-0 flex-1 truncate font-medium">
        {marker.more
          ? t('unread.countMore', { count: marker.count })
          : t('unread.count', { count: marker.count })}
      </span>
      <button
        type="button"
        aria-label={t('unread.jump')}
        onClick={() => void jump()}
        className="shrink-0 rounded px-2 py-0.5 font-semibold hover:bg-black/15"
      >
        {t('unread.jumpShort')}
      </button>
      <button
        type="button"
        onClick={marker.dismiss}
        className="shrink-0 rounded px-2 py-0.5 hover:bg-black/15"
      >
        {t('unread.markRead')}
      </button>
    </div>
  )
}

/** The line above the first new message; once it has been on screen, the banner has done its job. */
export const UnreadLine = ({ onSeen }: { onSeen: () => void }) => {
  const { t } = useTranslation()
  const line = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = line.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onSeen()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onSeen])

  return (
    <li>
      <div
        ref={line}
        role="separator"
        aria-label={t('unread.marker')}
        className="mx-4 my-2 flex items-center gap-2 text-xs font-semibold text-danger"
      >
        <span className="h-px flex-1 bg-danger" />
        {t('unread.markerShort')}
      </div>
    </li>
  )
}
