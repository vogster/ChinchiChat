import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Rss } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'

import type { Channel, Webhook } from '@chinchi/shared'

/** A follow of an announcement channel: where its posts come from, and a way to stop them. */
const FollowedRow = ({
  webhook,
  pending,
  onUnfollow,
}: {
  webhook: Webhook
  pending: boolean
  onUnfollow: () => void
}) => {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3 py-2">
      <Rss aria-hidden className="size-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{t('webhooks.followed', { name: webhook.name })}</p>
        {webhook.sourceGuildId && webhook.sourceChannelId ? (
          <Link
            to="/channels/$guildId/$channelId"
            params={{ guildId: webhook.sourceGuildId, channelId: webhook.sourceChannelId }}
            aria-label={t('webhooks.openSource', { name: webhook.name })}
            className="text-xs text-accent-text hover:underline"
          >
            {t('webhooks.openSourceShort')}
          </Link>
        ) : null}
      </div>
      <Button
        variant="secondary"
        fullWidth={false}
        pending={pending}
        aria-label={t('announcements.unfollowLabel', { name: webhook.name })}
        onClick={onUnfollow}
      >
        {t('announcements.unfollow')}
      </Button>
    </li>
  )
}

/**
 * A channel's incoming webhooks: create one (its URL is shown once), delete. Follows of
 * announcement channels show as such, ended by unfollowing.
 */
export const ChannelWebhooksTab = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const key = ['webhooks', channel.id] as const
  const [name, setName] = useState('')
  const [secretUrl, setSecretUrl] = useState<string | null>(null)
  const { data: webhooks = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.webhooks.list(channel.id)).webhooks,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key })
  const create = useMutation({
    mutationFn: () => api.webhooks.create(channel.id, name.trim()),
    onSuccess: ({ webhook, url }) => {
      setName('')
      // Already absolute (the instance's public address), ready to paste into a service.
      setSecretUrl(url)
      queryClient.setQueryData(key, [webhook, ...webhooks])
    },
  })
  const remove = useMutation({
    mutationFn: (webhookId: string) => api.webhooks.delete(webhookId),
    onSuccess: refresh,
  })
  const unfollow = useMutation({
    mutationFn: (webhook: Webhook) =>
      api.announcements.unfollow(webhook.sourceChannelId ?? '', webhook.id),
    onSuccess: refresh,
  })
  const error = create.error ?? remove.error ?? unfollow.error

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('webhooks.text')}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) create.mutate()
        }}
      >
        <TextField
          label={t('webhooks.name')}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" fullWidth={false} pending={create.isPending} disabled={!name.trim()}>
          {t('webhooks.create')}
        </Button>
      </form>
      {secretUrl ? (
        <div className="flex flex-col gap-2 rounded-md border border-accent/40 bg-accent/10 p-3">
          <TextField
            label={t('webhooks.url')}
            value={secretUrl}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-muted">{t('webhooks.urlOnce')}</p>
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={() => void navigator.clipboard?.writeText(secretUrl)}
          >
            {t('webhooks.copy')}
          </Button>
        </div>
      ) : null}
      {error ? <Alert tone="error">{errorMessage(t, error)}</Alert> : null}
      <ul aria-label={t('webhooks.list')} className="flex flex-col divide-y divide-line">
        {webhooks.map((webhook) =>
          webhook.sourceChannelId ? (
            <FollowedRow
              key={webhook.id}
              webhook={webhook}
              pending={unfollow.isPending}
              onUnfollow={() => unfollow.mutate(webhook)}
            />
          ) : (
            <li key={webhook.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{webhook.name}</p>
                <p className="truncate text-xs text-muted">
                  {t('webhooks.createdBy', { name: webhook.createdBy?.username ?? '—' })}
                </p>
              </div>
              <Button
                variant="danger"
                fullWidth={false}
                aria-label={t('webhooks.delete', { name: webhook.name })}
                onClick={() => remove.mutate(webhook.id)}
              >
                {t('webhooks.deleteShort')}
              </Button>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
