import { compareSnowflakes, replySnippetText } from '@chinchi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useApi } from '../../lib/api-context'
import { useCurrentUser } from '../auth/use-auth-actions'
import { messageKeys, readStatesQueryOptions } from './queries'
import { withReaction } from './reaction-cache'
import { overallProgress } from './upload-progress'

import type { MessageItem, MessagePages, ReadStates } from './queries'
import type { ApiClient, UploadProgress } from '@chinchi/sdk'
import type { Message, MessageReply, Snowflake } from '@chinchi/shared'
import type { QueryClient } from '@tanstack/react-query'

const updateMessages = (
  queryClient: QueryClient,
  channelId: Snowflake,
  change: (page: MessageItem[], index: number) => MessageItem[],
) =>
  queryClient.setQueryData<MessagePages>(messageKeys.channel(channelId), (data) =>
    data ? { ...data, pages: data.pages.map(change) } : data,
  )

const withoutNonce = (nonce: string) => (page: MessageItem[]) =>
  page.filter((m) => !(m.pending && m.nonce === nonce))

/**
 * Optimistic sending: the message shows up at once, then is replaced by the server's copy
 * (here or via MESSAGE_CREATE, whichever comes first — both dedupe by id and nonce).
 */
export interface SendInput {
  readonly content: string
  readonly nonce: string
  /** Kept on the optimistic copy, so a retry is still a reply. */
  readonly reply?: MessageReply | undefined
  /** Uploaded first (one by one), then sent as the message's attachments. */
  readonly files?: readonly File[] | undefined
}

/** What the optimistic copy of a reply shows until the server's copy arrives. */
export const toReply = (message: Message, mentionsAuthor: boolean): MessageReply => ({
  messageId: message.id,
  mentionsAuthor,
  message: {
    author: message.author,
    content: replySnippetText(message.content),
    attachmentCount: message.attachments.length,
  },
})

/**
 * Gets a message to the server: its files first (telling how far), then the message. The
 * server's copy comes back, or (encrypted) only its id: the gateway's echo then replaces the
 * optimistic one by its nonce.
 */
export type Deliver = (
  input: SendInput,
  onProgress: UploadProgress,
) => Promise<Message | { readonly id: Snowflake }>

/** An ordinary channel or DM: files as they are, then the message. */
const plainDelivery =
  (api: ApiClient, channelId: Snowflake): Deliver =>
  async ({ content, nonce, reply, files = [] }, onProgress) => {
    const progress = overallProgress(files, onProgress)
    const attachmentIds: Snowflake[] = []
    for (const [index, file] of files.entries()) {
      attachmentIds.push(
        await api.attachments.upload(channelId, file, { onProgress: progress(index) }),
      )
    }
    const { message } = await api.messages.create(channelId, {
      content,
      nonce,
      ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
      ...(reply ? { replyTo: reply.messageId, replyMention: reply.mentionsAuthor } : {}),
    })
    return message
  }

/**
 * `guildId` is null in DMs. `deliver` replaces the plain way to the server (an encrypted
 * conversation encrypts first); the message shows at once either way, with its upload going.
 */
export const useSendMessage = (
  channelId: Snowflake,
  guildId: Snowflake | null,
  deliver?: Deliver,
) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const me = useCurrentUser()

  /** The upload on the optimistic copy, redrawn only when the whole percent moves. */
  const tracking = (nonce: string): UploadProgress => {
    let shown = -1
    return (sent, total) => {
      const percent = total > 0 ? Math.floor((sent / total) * 100) : 100
      if (percent === shown) return
      shown = percent
      updateMessages(queryClient, channelId, (page) =>
        page.map((m) =>
          m.pending === 'sending' && m.nonce === nonce ? { ...m, upload: { sent, total } } : m,
        ),
      )
    }
  }

  return useMutation({
    mutationFn: (input: SendInput) =>
      (deliver ?? plainDelivery(api, channelId))(input, tracking(input.nonce)),
    onMutate: ({ content, nonce, reply, files = [] }) => {
      const optimistic: MessageItem = {
        id: `pending-${nonce}`,
        channelId,
        guildId,
        webhook: null,
        interaction: null,
        system: null,
        author: me
          ? {
              id: me.id,
              username: me.username,
              displayName: me.displayName,
              avatarUrl: me.avatarUrl,
            }
          : null,
        content,
        ciphertext: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        attachments: [],
        reply: reply ?? null,
        mentions: { users: [], roles: [], everyone: false, here: false },
        pinned: false,
        published: false,
        embeds: [],
        reactions: [],
        nonce,
        pending: 'sending',
        ...(files.length > 0
          ? { files, upload: { sent: 0, total: files.reduce((sum, f) => sum + f.size, 0) } }
          : {}),
      }
      updateMessages(queryClient, channelId, (page, index) =>
        index === 0 ? [...withoutNonce(nonce)(page), optimistic] : page,
      )
    },
    onSuccess: (message, { nonce }) => {
      if (!('channelId' in message)) {
        // Only the id: refetch in case the echo never comes (the gateway was down meanwhile).
        void queryClient.invalidateQueries({ queryKey: messageKeys.channel(channelId) })
        return
      }
      updateMessages(queryClient, channelId, (page, index) => {
        if (index !== 0) return page
        const rest = withoutNonce(nonce)(page)
        return rest.some((m) => m.id === message.id) ? rest : [...rest, message]
      })
    },
    onError: (_error, { nonce }) =>
      updateMessages(queryClient, channelId, (page) =>
        page.map((m) => {
          if (!(m.pending && m.nonce === nonce)) return m
          const { upload: _, ...rest } = m
          return { ...rest, pending: 'failed' as const }
        }),
      ),
  })
}

/** Drops a failed optimistic message (after a retry or when the user discards it). */
export const useDiscardFailed = (channelId: Snowflake) => {
  const queryClient = useQueryClient()
  return (nonce: string) => updateMessages(queryClient, channelId, withoutNonce(nonce))
}

export const useEditMessage = (channelId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: Snowflake; content: string }) =>
      api.messages.update(channelId, messageId, content),
    onSuccess: ({ message }) =>
      updateMessages(queryClient, channelId, (page) =>
        // Reactions may have changed meanwhile: keep the ones the cache follows.
        page.map((m) => (m.id === message.id ? { ...message, reactions: m.reactions } : m)),
      ),
  })
}

/** Pins or unpins; the list updates from the gateway's MESSAGE_UPDATE. */
export const usePinMessage = (channelId: Snowflake) => {
  const api = useApi()
  return useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: Snowflake; pinned: boolean }) =>
      pinned ? api.pins.pin(channelId, messageId) : api.pins.unpin(channelId, messageId),
  })
}

/** Sends an announcement out to the following channels; marks it at once. */
export const usePublishMessage = (channelId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: Snowflake) => api.announcements.publish(channelId, messageId),
    onSuccess: (_result, messageId) =>
      updateMessages(queryClient, channelId, (page) =>
        page.map((m) => (m.id === messageId ? { ...m, published: true } : m)),
      ),
  })
}

/** Adds or removes my reaction, updating the message at once (the gateway echo is a no-op). */
export const useToggleReaction = (channelId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const change = (messageId: Snowflake, emoji: string, add: boolean) =>
    updateMessages(queryClient, channelId, (page) =>
      page.map((m) =>
        m.id === messageId
          ? { ...m, reactions: withReaction(m.reactions, { emoji, add, mine: true }) }
          : m,
      ),
    )
  return useMutation({
    mutationFn: ({
      messageId,
      emoji,
      add,
    }: {
      messageId: Snowflake
      emoji: string
      add: boolean
    }) =>
      add
        ? api.reactions.add(channelId, messageId, emoji)
        : api.reactions.remove(channelId, messageId, emoji),
    onMutate: ({ messageId, emoji, add }) => change(messageId, emoji, add),
    // Undo what the server refused (e.g. no permission to add a new emoji).
    onError: (_error, { messageId, emoji, add }) => change(messageId, emoji, !add),
  })
}

export const useDeleteMessage = (channelId: Snowflake) => {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: Snowflake) => api.messages.delete(channelId, messageId),
    onSuccess: (_result, messageId) =>
      updateMessages(queryClient, channelId, (page) => page.filter((m) => m.id !== messageId)),
  })
}

/** Unread when the channel has a message newer than what the user read. */
export const isUnread = (
  lastMessageId: Snowflake | null,
  lastRead: Snowflake | undefined,
): boolean =>
  lastMessageId !== null &&
  (lastRead === undefined || compareSnowflakes(lastMessageId, lastRead) > 0)

export const useReadStates = () => useQuery(readStatesQueryOptions(useApi())).data

/**
 * Marks the newest message read as soon as it is shown (and again when the tab becomes visible).
 * No debounce: a quick glance at a channel should still clear it.
 */
export const useAckLatest = (channelId: Snowflake, latestId: Snowflake | undefined) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const readStates = useReadStates()
  const lastRead = readStates?.[channelId]

  useEffect(() => {
    // Until the read states are known, "unread" would only be a guess (and acking would
    // overwrite where reading had stopped before the unread marker sees it).
    if (readStates === undefined) return
    if (!latestId || latestId.startsWith('pending-') || !isUnread(latestId, lastRead)) return
    const ack = () => {
      if (document.visibilityState !== 'visible') return
      queryClient.setQueryData<ReadStates>(messageKeys.readStates, (states) => ({
        ...states,
        [channelId]: latestId,
      }))
      api.messages.ack(channelId, latestId).catch(() => undefined)
    }
    ack()
    document.addEventListener('visibilitychange', ack)
    return () => document.removeEventListener('visibilitychange', ack)
  }, [api, queryClient, channelId, latestId, lastRead, readStates])
}

/** Tells others we are typing, at most once per interval while keys are pressed. */
export const useTypingNotifier = (channelId: Snowflake, intervalMs = 8000) => {
  const api = useApi()
  const lastSent = useRef(0)
  return {
    typed: () => {
      const now = Date.now()
      if (now - lastSent.current < intervalMs) return
      lastSent.current = now
      api.messages.typing(channelId).catch(() => undefined)
    },
    sent: () => {
      lastSent.current = 0
    },
  }
}
