import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Hash, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { TextField } from '../../components/ui/text-field'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { privateChannelName } from '../dms/dm-names'
import { dmsQueryOptions } from '../dms/queries'
import { guildQueryOptions, guildsQueryOptions } from '../guilds/queries'

import type { MessageItem } from './queries'

interface Destination {
  readonly id: string
  readonly kind: 'dm' | 'channel'
  readonly name: string
  /** The server a channel belongs to. */
  readonly where: string | null
}

/** Every place the message can go: DMs (not encrypted ones) and text channels of my servers. */
const useDestinations = (): Destination[] => {
  const { t } = useTranslation()
  const api = useApi()
  const { data: dms = [] } = useQuery(dmsQueryOptions(api))
  const { data: guilds = [] } = useQuery(guildsQueryOptions(api))
  const details = useQueries({
    queries: guilds.map((guild) => guildQueryOptions(api, guild.id)),
  })
  return [
    ...dms
      .filter((dm) => !dm.encrypted)
      .map((dm) => ({
        id: dm.id,
        kind: 'dm' as const,
        name: privateChannelName(t, dm),
        where: null,
      })),
    ...details.flatMap(({ data: guild }) =>
      guild
        ? guild.channels
            .filter((channel) => channel.type === 'text')
            .map((channel) => ({
              id: channel.id,
              kind: 'channel' as const,
              name: channel.name,
              where: guild.name,
            }))
        : [],
    ),
  ]
}

/** Picks where a message goes on to, with an optional comment of one's own. */
export const ForwardDialog = ({
  message,
  onOpenChange,
}: {
  message: MessageItem
  onOpenChange: (open: boolean) => void
}) => {
  const { t } = useTranslation()
  const api = useApi()
  const destinations = useDestinations()
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const forward = useMutation({
    mutationFn: (channelId: string) =>
      api.messages.create(channelId, {
        content: comment.trim(),
        forward: { channelId: message.channelId, messageId: message.id },
      }),
    onSuccess: () => onOpenChange(false),
  })
  const needle = query.trim().toLocaleLowerCase()
  const shown = destinations.filter(
    (d) => !needle || `${d.name} ${d.where ?? ''}`.toLocaleLowerCase().includes(needle),
  )

  return (
    <Dialog open onOpenChange={onOpenChange} title={t('forward.title')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (target) forward.mutate(target)
        }}
      >
        <input
          type="search"
          aria-label={t('search.label')}
          placeholder={t('forward.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="rounded-md border border-line bg-rail px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {shown.map((destination) => (
            <li key={destination.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-chip has-checked:bg-chip">
                {destination.kind === 'dm' ? (
                  <MessageCircle aria-hidden className="size-4 shrink-0 text-muted" />
                ) : (
                  <Hash aria-hidden className="size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {destination.name}
                  {destination.where ? (
                    <span className="ml-1 text-xs text-muted">{destination.where}</span>
                  ) : null}
                </span>
                <input
                  type="radio"
                  name="forward-target"
                  aria-label={
                    destination.where
                      ? `${destination.name}, ${destination.where}`
                      : destination.name
                  }
                  checked={target === destination.id}
                  onChange={() => setTarget(destination.id)}
                  className="accent-[var(--zl-accent)]"
                />
              </label>
            </li>
          ))}
          {shown.length === 0 ? (
            <li className="py-2 text-center text-sm text-muted">{t('search.nothing')}</li>
          ) : null}
        </ul>
        <TextField
          label={t('forward.comment')}
          value={comment}
          maxLength={2000}
          onChange={(event) => setComment(event.target.value)}
        />
        {forward.error ? <Alert tone="error">{errorMessage(t, forward.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!target} pending={forward.isPending}>
            {t('forward.send')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
