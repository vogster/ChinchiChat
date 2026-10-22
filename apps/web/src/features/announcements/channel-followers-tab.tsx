import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { followerKeys, followerLabel, followersQueryOptions } from './queries'

import type { Channel } from '@chinchi/shared'

/**
 * An announcement channel's followers, for those who manage it: how many channels follow it and
 * where (a server they can't see stays unnamed), each one removable.
 */
export const ChannelFollowersTab = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const { data: followers, isSuccess } = useQuery(followersQueryOptions(api, channel.id))
  const remove = useMutation({
    mutationFn: (webhookId: string) => api.announcements.unfollow(channel.id, webhookId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: followerKeys.of(channel.id) }),
  })

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('announcements.followersHint')}</p>
      {isSuccess ? (
        <p className="font-medium">
          {t('announcements.followersCount', { count: followers.length })}
        </p>
      ) : null}
      {remove.isError ? <Alert tone="error">{errorMessage(t, remove.error)}</Alert> : null}
      <ul aria-label={t('announcements.followersList')} className="flex flex-col gap-1">
        {(followers ?? []).map((follower) => {
          const label = followerLabel(follower, t('announcements.hiddenServer'))
          return (
            <li
              key={follower.webhookId}
              className="flex items-center gap-3 rounded-field bg-field py-1.5 pr-1.5 pl-3"
            >
              <span
                className={`min-w-0 flex-1 truncate text-sm ${follower.guildName ? '' : 'text-faint italic'}`}
              >
                {label}
              </span>
              <Button
                variant="danger"
                fullWidth={false}
                pending={remove.isPending && remove.variables === follower.webhookId}
                aria-label={t('announcements.removeFollowerLabel', { name: label })}
                onClick={() => remove.mutate(follower.webhookId)}
              >
                {t('announcements.removeFollower')}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
