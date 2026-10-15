import { useQueryClient } from '@tanstack/react-query'
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
  if (marker.count === 0) return null

  const jump = () => {
    if (marker.firstUnreadId) void jumpWhenRendered(marker.firstUnreadId)
    // Past the loaded history: page back to where reading stopped.
    else if (marker.lastReadId) void revealMessage(queryClient, api, channelId, marker.lastReadId)
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
        onClick={jump}
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
