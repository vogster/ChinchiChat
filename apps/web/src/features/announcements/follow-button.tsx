import { useQuery } from '@tanstack/react-query'
import { Rss } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { followersQueryOptions } from './queries'

import type { Snowflake } from '@chinchi/shared'

/**
 * The header's follow button of an announcement channel: an icon like its neighbours, pressed
 * once one of the user's channels follows it.
 */
export const FollowButton = ({
  channelId,
  onClick,
  className,
}: {
  channelId: Snowflake
  onClick: () => void
  className: string
}) => {
  const { t } = useTranslation()
  const { data: followers = [] } = useQuery(followersQueryOptions(useApi(), channelId))
  const followed = followers.some((follower) => follower.mine)
  const label = followed ? t('announcements.followingButton') : t('announcements.followButton')
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={followed}
      onClick={onClick}
      className={className}
    >
      <Rss aria-hidden className="size-5" />
    </button>
  )
}
