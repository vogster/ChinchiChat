import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { FollowTargetPicker } from './follow-target-picker'
import { followerKeys, followerLabel, followersQueryOptions } from './queries'

import type { Channel } from '@chinchi/shared'

/**
 * Following an announcement channel: where it already comes on the user's servers (each can be
 * unfollowed), and a channel they manage, on any server, to add.
 */
export const FollowDialog = ({
  channel,
  onOpenChange,
}: {
  channel: Channel
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const { data: followers = [] } = useQuery(followersQueryOptions(api, channel.id))
  const mine = followers.filter((follower) => follower.mine)
  const [targetId, setTargetId] = useState<string | null>(null)
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: followerKeys.of(channel.id) })
  const follow = useMutation({
    mutationFn: (channelId: string) => api.announcements.follow(channel.id, channelId),
    onSuccess: () => {
      setTargetId(null)
      refresh()
    },
  })
  const unfollow = useMutation({
    mutationFn: (webhookId: string) => api.announcements.unfollow(channel.id, webhookId),
    onSuccess: refresh,
  })
  const error = follow.error ?? unfollow.error

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('announcements.followTitle', { name: channel.name })}
      description={t('announcements.followHint')}
    >
      <div className="flex flex-col gap-4">
        {mine.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('announcements.current')}
            </h3>
            <ul aria-label={t('announcements.current')} className="flex flex-col gap-1">
              {mine.map((follower) => {
                const label = followerLabel(follower, t('announcements.hiddenServer'))
                return (
                  <li
                    key={follower.webhookId}
                    className="flex items-center gap-3 rounded-field bg-field py-1.5 pr-1.5 pl-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                    <button
                      type="button"
                      aria-label={t('announcements.unfollowLabel', { name: label })}
                      disabled={unfollow.isPending}
                      onClick={() => unfollow.mutate(follower.webhookId)}
                      className="h-8 shrink-0 rounded-full bg-side px-3 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
                    >
                      {t('announcements.unfollow')}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (targetId) follow.mutate(targetId)
          }}
        >
          <h3 className="text-xs font-bold tracking-wide text-muted uppercase">
            {t('announcements.add')}
          </h3>
          <FollowTargetPicker
            sourceId={channel.id}
            following={new Set(mine.flatMap((follower) => follower.channelId ?? []))}
            value={targetId}
            onChange={setTargetId}
          />
          {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
          {follow.isSuccess ? <Alert tone="success">{t('announcements.followed')}</Alert> : null}
          <Button type="submit" pending={follow.isPending} disabled={!targetId}>
            {t('announcements.follow')}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}
