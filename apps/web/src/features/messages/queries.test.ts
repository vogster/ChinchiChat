import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeApi } from '../../test/fake-api'
import { messageKeys, messagesQueryOptions } from './queries'

const CHANNEL = '503'
const MINUTE = 60_000

describe('message pages in the cache', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stay for half an hour after the channel is left, then go', async () => {
    const api = createFakeApi()
    const queryClient = new QueryClient()
    await queryClient.prefetchInfiniteQuery(messagesQueryOptions(api as never, CHANNEL))

    // Back after ten minutes: no new request, the gateway kept them fresh meanwhile.
    vi.advanceTimersByTime(10 * MINUTE)
    expect(queryClient.getQueryData(messageKeys.channel(CHANNEL))).toBeDefined()
    await queryClient.ensureInfiniteQueryData(messagesQueryOptions(api as never, CHANNEL))
    expect(api.messages.list).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31 * MINUTE)
    expect(queryClient.getQueryData(messageKeys.channel(CHANNEL))).toBeUndefined()
  })
})
