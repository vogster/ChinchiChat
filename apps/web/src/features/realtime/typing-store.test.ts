import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTypingStore, TYPING_TTL_MS } from './typing-store'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createTypingStore', () => {
  it('tracks who is typing per channel and notifies listeners', () => {
    const store = createTypingStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.start('c1', 'alice')
    store.start('c1', 'bob')
    store.start('c2', 'carol')

    expect(store.typingIn('c1')).toEqual(['alice', 'bob'])
    expect(store.typingIn('c2')).toEqual(['carol'])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('forgets typists after the timeout, unless they keep typing', () => {
    const store = createTypingStore()
    store.start('c1', 'alice')
    vi.advanceTimersByTime(TYPING_TTL_MS - 1000)
    store.start('c1', 'alice')
    vi.advanceTimersByTime(2000)
    expect(store.typingIn('c1')).toEqual(['alice'])

    vi.advanceTimersByTime(TYPING_TTL_MS)
    expect(store.typingIn('c1')).toEqual([])
  })

  it('stops immediately when the person sends their message', () => {
    const store = createTypingStore()
    const before = store.snapshot()
    store.start('c1', 'alice')
    store.stop('c1', 'alice')

    expect(store.typingIn('c1')).toEqual([])
    expect(store.snapshot()).not.toBe(before)
  })

  it('ignores stop for people who are not typing', () => {
    const store = createTypingStore()
    const listener = vi.fn()
    store.subscribe(listener)()

    store.stop('c1', 'nobody')
    expect(listener).not.toHaveBeenCalled()
  })
})
