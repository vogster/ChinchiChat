import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'

import type { SenderCheck } from '../e2ee/client'
import type { SealedFile } from '../e2ee/codec'
import type { ApiClient } from '@chinchi/sdk'
import type { MentionCounts, Message, PresenceStatus, Snowflake } from '@chinchi/shared'
import type { InfiniteData } from '@tanstack/react-query'

export const PAGE_SIZE = 50
/** How long a left channel's messages stay in the cache. */
const MESSAGES_GC_TIME = 30 * 60_000

/** A message as the client knows it; optimistic sends carry a local status until confirmed. */
export type MessageItem = Message & {
  readonly pending?: 'sending' | 'failed'
  /** Files of a message still being sent (kept so a failed send can be retried with them). */
  readonly files?: readonly File[]
  /** How far those files have gone up, in bytes, while the message is being sent. */
  readonly upload?: { readonly sent: number; readonly total: number }
  /** Files of an encrypted message: where the ciphertext is and what opens it. */
  readonly encryptedFiles?: readonly SealedFile[]
  /** Shown as one quiet line instead of the message (messages this device can't read). */
  readonly notice?: string
  /** Encrypted messages: whether the signer MLS verified is the author the server named. */
  readonly senderCheck?: SenderCheck
}

/** Pages go newest → older; each page is oldest → newest. `undefined` cursor = latest page. */
export type MessagePages = InfiniteData<MessageItem[], Snowflake | undefined>

export const messageKeys = {
  /** Every channel's message pages. */
  channels: ['messages'] as const,
  channel: (channelId: Snowflake) => ['messages', channelId] as const,
  readStates: ['readStates'] as const,
  mentionCounts: ['mentionCounts'] as const,
  // Its own root: prefix updates of a channel's message pages must never touch it.
  pins: (channelId: Snowflake) => ['pins', channelId] as const,
  presences: ['presences'] as const,
}

export const messagesQueryOptions = (api: ApiClient, channelId: Snowflake) =>
  infiniteQueryOptions({
    queryKey: messageKeys.channel(channelId),
    queryFn: async ({ pageParam }): Promise<MessageItem[]> =>
      (
        await api.messages.list(channelId, {
          limit: PAGE_SIZE,
          ...(pageParam ? { before: pageParam } : {}),
        })
      ).messages,
    initialPageParam: undefined as Snowflake | undefined,
    // A full page means there may be more history before its oldest message.
    getNextPageParam: (page) => (page.length === PAGE_SIZE ? page[0]?.id : undefined),
    // Kept fresh by the gateway; refetching would drop older pages the user scrolled to.
    staleTime: Infinity,
    // Also while the channel is not open (the gateway updates it then too): coming back within
    // half an hour shows it at once. A new gateway session marks it stale (see onReady).
    gcTime: MESSAGES_GC_TIME,
  })

/** channelId → last read message id. */
export type ReadStates = Readonly<Record<Snowflake, Snowflake>>

export const readStatesQueryOptions = (api: ApiClient) =>
  queryOptions({
    queryKey: messageKeys.readStates,
    queryFn: async (): Promise<ReadStates> =>
      Object.fromEntries(
        (await api.messages.readStates()).readStates.map((state) => [
          state.channelId,
          state.lastReadMessageId,
        ]),
      ),
    staleTime: Infinity,
  })

/** Pinned messages of a channel; refreshed when a MESSAGE_UPDATE changes a pin. */
export const pinsQueryOptions = (api: ApiClient, channelId: Snowflake) =>
  queryOptions({
    queryKey: messageKeys.pins(channelId),
    queryFn: async () => (await api.pins.list(channelId)).messages,
  })

/** Unread mentions per channel. Filled by the gateway (READY, new messages, acks). */
export const mentionCountsQueryOptions = () =>
  queryOptions({
    queryKey: messageKeys.mentionCounts,
    queryFn: (): MentionCounts => ({}),
    staleTime: Infinity,
  })

/** userId → status; users missing from the map are offline. Filled by the gateway. */
export type Presences = Readonly<Record<Snowflake, PresenceStatus>>

export const presencesQueryOptions = () =>
  queryOptions({
    queryKey: messageKeys.presences,
    queryFn: (): Presences => ({}),
    staleTime: Infinity,
  })

/** Newest-first flattening helper: all loaded messages oldest → newest. */
export const flattenPages = (
  data: { readonly pages: readonly MessageItem[][] } | undefined,
): MessageItem[] => (data ? [...data.pages].reverse().flat() : [])
