import { describe, expect, it } from 'vitest'

import { createDeviceAdditions, MAX_ADDITIONS } from './device-additions'

const BOB = '2'
const PHONE = { deviceId: '70', ownerId: BOB }

const addTimes = (additions: ReturnType<typeof createDeviceAdditions>, times: number) => {
  for (let i = 0; i < times; i += 1) additions.record('500', [PHONE])
}

describe('device additions', () => {
  it('stop allowing a device after it went in a few times, in that conversation only', () => {
    const additions = createDeviceAdditions()
    addTimes(additions, MAX_ADDITIONS - 1)
    expect(additions.allowed('500', PHONE.deviceId)).toBe(true)

    additions.record('500', [PHONE])

    expect(additions.allowed('500', PHONE.deviceId)).toBe(false)
    expect(additions.allowed('501', PHONE.deviceId)).toBe(true)
  })

  it('start over for someone whose devices changed, and on sign-out', () => {
    const additions = createDeviceAdditions()
    addTimes(additions, MAX_ADDITIONS)
    additions.record('500', [{ deviceId: '80', ownerId: '3' }])
    additions.record('500', [{ deviceId: '80', ownerId: '3' }])

    additions.forgetOwner(BOB)
    expect(additions.allowed('500', PHONE.deviceId)).toBe(true)
    expect(additions.allowed('500', '80')).toBe(false)

    additions.clear()
    expect(additions.allowed('500', '80')).toBe(true)
  })
})
