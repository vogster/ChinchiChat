import { describe, expect, it } from 'vitest'

import { isPublicAddress } from './ip-policy'

describe('isPublicAddress', () => {
  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e'])(
    'allows public %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true)
    },
  )

  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback range', '127.255.0.1'],
    ['private 10/8', '10.1.2.3'],
    ['private 172.16/12', '172.20.0.5'],
    ['private 192.168/16', '192.168.1.1'],
    ['link-local (cloud metadata)', '169.254.169.254'],
    ['carrier-grade NAT', '100.64.0.1'],
    ['unspecified', '0.0.0.0'],
    ['this network', '0.1.2.3'],
    ['broadcast', '255.255.255.255'],
    ['multicast', '224.0.0.1'],
    ['documentation', '192.0.2.10'],
    ['benchmarking', '198.18.0.1'],
    ['IPv6 loopback', '::1'],
    ['IPv6 unspecified', '::'],
    ['IPv6 unique local', 'fd12:3456::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 multicast', 'ff02::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['IPv4-mapped private', '::ffff:10.0.0.1'],
    ['NAT64 of a private address', '64:ff9b::a00:1'],
    ['6to4', '2002:7f00:1::1'],
    ['documentation v6', '2001:db8::1'],
    ['IPv4-compatible (deprecated)', '::7f00:1'],
    ['garbage', 'not-an-ip'],
  ])('refuses %s (%s)', (_name, ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it('allows IPv4-mapped public addresses', () => {
    expect(isPublicAddress('::ffff:93.184.216.34')).toBe(true)
  })
})
