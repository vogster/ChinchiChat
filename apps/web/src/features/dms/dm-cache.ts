import { compareSnowflakes } from '@chinchi/shared'

import { dmKeys } from './queries'

import type { PrivateChannel } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

/** Latest activity first; a DM without messages counts from when it was created. */
const byActivity = (a: PrivateChannel, b: PrivateChannel) =>
  compareSnowflakes(b.lastMessageId ?? b.id, a.lastMessageId ?? a.id)

const update = (
  queryClient: QueryClient,
  change: (channels: readonly PrivateChannel[]) => PrivateChannel[],
) =>
  queryClient.setQueryData<PrivateChannel[]>(dmKeys.all, (channels) =>
    channels ? change(channels).sort(byActivity) : channels,
  )

export const upsertPrivateChannel = (queryClient: QueryClient, channel: PrivateChannel) =>
  update(queryClient, (channels) => [...channels.filter((c) => c.id !== channel.id), channel])

export const removePrivateChannel = (queryClient: QueryClient, channelId: string) =>
  update(queryClient, (channels) => channels.filter((c) => c.id !== channelId))

/** A new message moves the DM to the top. */
export const bumpPrivateChannel = (
  queryClient: QueryClient,
  channelId: string,
  messageId: string,
) =>
  update(queryClient, (channels) =>
    channels.map((c) => (c.id === channelId ? { ...c, lastMessageId: messageId } : c)),
  )
