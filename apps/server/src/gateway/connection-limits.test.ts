import { describe, expect, it } from 'vitest'

import { createConnectionLimits } from './connection-limits'

const limits = (now: () => number = () => 0) =>
  createConnectionLimits({ perUser: 2, perAddress: 3, identifiesPerMinute: 4, now })

describe('gateway connection limits', () => {
  it('lets a user hold only so many connections, and frees a place when one closes', () => {
    const gate = limits()
    const first = gate.admitUser('u1')
    const second = gate.admitUser('u1')
    expect(first && second).toBeTruthy()
    expect(gate.admitUser('u1')).toBeNull()
    expect(gate.admitUser('u2')).not.toBeNull()

    first?.()
    first?.()
    expect(gate.admitUser('u1')).not.toBeNull()
    expect(gate.admitUser('u1')).toBeNull()
  })

  it('counts addresses the same way, an IPv6 /64 as one', () => {
    const gate = limits()
    gate.admitAddress('2001:db8:1:2::10')
    gate.admitAddress('2001:db8:1:2::11')
    const third = gate.admitAddress('2001:db8:1:2:ffff::1')
    expect(third).not.toBeNull()
    expect(gate.admitAddress('2001:db8:1:2::12')).toBeNull()
    expect(gate.admitAddress('192.0.2.1')).not.toBeNull()
    third?.()
    expect(gate.admitAddress('2001:db8:1:2::12')).not.toBeNull()
  })

  it('caps how often a user starts a session (each one builds a full READY)', () => {
    let time = 0
    const gate = limits(() => time)
    for (let i = 0; i < 4; i++) gate.admitUser('u1')?.()
    expect(gate.admitUser('u1')).toBeNull()
    time += 61_000
    expect(gate.admitUser('u1')).not.toBeNull()
  })
})
