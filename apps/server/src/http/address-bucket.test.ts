import { describe, expect, it } from 'vitest'

import { addressBucket } from './address-bucket'

describe('addressBucket', () => {
  it('keeps IPv4 addresses (also IPv4-mapped IPv6) as they are', () => {
    expect(addressBucket('203.0.113.5')).toBe('203.0.113.5')
    expect(addressBucket('::ffff:203.0.113.5')).toBe('203.0.113.5')
  })

  it('groups an IPv6 /64 together', () => {
    expect(addressBucket('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(addressBucket('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64')
    expect(addressBucket('2001:db8:1:3::1')).not.toBe(addressBucket('2001:db8:1:2::1'))
  })

  it('passes anything else through', () => {
    expect(addressBucket('unknown')).toBe('unknown')
  })
})
