import { describe, expect, it, vi } from 'vitest'

import { announceUnread, mirrorUnreadBadge } from './shell'

describe('the unread badge of the shell', () => {
  it('follows the total the web app announces, and clears at zero', () => {
    const setBadgeCount = vi.fn(async () => undefined)
    const stop = mirrorUnreadBadge(setBadgeCount)

    announceUnread(3)
    announceUnread(0)

    expect(setBadgeCount.mock.calls).toEqual([[3], [undefined]])

    stop()
    announceUnread(5)
    expect(setBadgeCount).toHaveBeenCalledTimes(2)
  })

  it('survives a shell that refuses to show badges', () => {
    const stop = mirrorUnreadBadge(async () => {
      throw new Error('not supported here')
    })
    expect(() => announceUnread(1)).not.toThrow()
    stop()
  })
})
