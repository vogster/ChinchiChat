import { describe, expect, it } from 'vitest'

import { createMemoryLoginThrottle, LOCKOUT_SECONDS, MAX_FAILED_LOGINS } from './login-throttle'

describe('in-memory login throttle', () => {
  it('lets the allowed attempts through, then locks until the window passes', async () => {
    let now = 0
    const throttle = createMemoryLoginThrottle(() => now)
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) expect(await throttle.take('alice')).toBe(true)

    expect(await throttle.take('alice')).toBe(false)
    expect(await throttle.take('bob')).toBe(true)

    now += LOCKOUT_SECONDS * 1000 + 1
    expect(await throttle.take('alice')).toBe(true)
  })

  it('starts over after a reset', async () => {
    const throttle = createMemoryLoginThrottle(() => 0)
    for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) await throttle.take('alice')
    await throttle.reset('alice')

    expect(await throttle.take('alice')).toBe(true)
  })

  it('forgets windows that ran out', async () => {
    let now = 0
    const throttle = createMemoryLoginThrottle(() => now)
    for (let i = 0; i < 100; i += 1) await throttle.take(`guess-${i}`)
    now += LOCKOUT_SECONDS * 1000 + 1
    await throttle.take('another')

    expect(throttle.size()).toBe(1)
  })
})
