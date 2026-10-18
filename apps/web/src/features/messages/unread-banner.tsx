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
    <div className="absolute top-2.5 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-full bg-side py-1 pr-1 pl-3.5 shadow-popover">
      <span
        aria-hidden
        className="mr-1.5 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_var(--zl-accent-soft)]"
      />
      <span className="min-w-0 truncate text-[13px] font-semibold">
        {marker.more
          ? t('unread.countMore', { count: marker.count })
          : t('unread.count', { count: marker.count })}
      </span>
      <button
        type="button"
        aria-label={t('unread.jump')}
        onClick={() => void jump()}
        className="ml-1.5 h-9 shrink-0 rounded-full bg-accent px-3.5 text-[12.5px] font-semibold text-accent-contrast hover:brightness-105"
      >
        {t('unread.jumpShort')}
      </button>
      <button
        type="button"
        onClick={marker.dismiss}
        className="h-9 shrink-0 rounded-full px-3 text-[12.5px] font-medium text-muted hover:bg-field hover:text-text"
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
        className="flex items-center gap-2.5 px-4 pt-1 pb-1.5"
      >
        <span className="h-0.5 flex-1 rounded-full bg-accent" />
        <span className="flex h-[22px] items-center rounded-full bg-accent px-2.5 text-[11.5px] font-semibold text-accent-contrast">
          {t('unread.markerShort')}
        </span>
      </div>
    </li>
  )
}
