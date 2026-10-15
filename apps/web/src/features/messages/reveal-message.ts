import { jumpToMessage } from './jump-to-message'
import { PAGE_SIZE, messageKeys, messagesQueryOptions } from './queries'

import type { MessageItem, MessagePages } from './queries'
import type { QueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@chinchi/sdk'
import type { Snowflake } from '@chinchi/shared'

/** How far back to page for a message before giving up (50 messages a page). */
const MAX_PAGES = 40

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

/** Waits for a message to be rendered, then jumps to it. */
export const jumpWhenRendered = async (messageId: Snowflake, signal?: AbortSignal) => {
  for (let tries = 0; tries < 60 && !signal?.aborted; tries += 1) {
    if (jumpToMessage(messageId)) return true
    await nextFrame()
  }
  return false
}

const isLoaded = (pages: MessagePages | undefined, messageId: Snowflake) =>
  pages?.pages.some((page) => page.some((m) => m.id === messageId)) ?? false

/**
 * Brings any message of a channel into view, loading older history page by page until
 * it is there (search results, links). False when it couldn't be found.
 */
export const revealMessage = async (
  queryClient: QueryClient,
  api: ApiClient,
  channelId: Snowflake,
  messageId: Snowflake,
  /** Aborted when the user moves on (another result, another page). */
  signal?: AbortSignal,
): Promise<boolean> => {
  const key = messageKeys.channel(channelId)
  await queryClient.ensureInfiniteQueryData(messagesQueryOptions(api, channelId))
  for (let page = 0; page < MAX_PAGES && !signal?.aborted; page += 1) {
    const current = queryClient.getQueryData<MessagePages>(key)
    if (isLoaded(current, messageId)) return jumpWhenRendered(messageId, signal)
    const oldest = current?.pages.at(-1)?.[0]?.id
    if (!oldest) return false
    const older: MessageItem[] = (
      await api.messages.list(channelId, { limit: PAGE_SIZE, before: oldest })
    ).messages
    if (older.length === 0 || signal?.aborted) return false
    queryClient.setQueryData<MessagePages>(key, (data) =>
      // Scrolling may have loaded the same page meanwhile: add ours only if it still fits.
      data && data.pages.at(-1)?.[0]?.id === oldest
        ? { pages: [...data.pages, older], pageParams: [...data.pageParams, oldest] }
        : data,
    )
  }
  return false
}
