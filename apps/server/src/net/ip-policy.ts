import ipaddr from 'ipaddr.js'

/**
 * Whether the server may connect to this address on a user's behalf (link previews). Only
 * globally routable unicast: never loopback, private, link-local (cloud metadata), CGNAT,
 * multicast, documentation or benchmarking ranges, nor IPv6 forms that embed an IPv4 address
 * (6to4, NAT64, Teredo). IPv4-mapped IPv6 is judged by the IPv4 address inside.
 */
export const isPublicAddress = (ip: string): boolean => {
  if (!ipaddr.isValid(ip)) return false
  const parsed = ipaddr.parse(ip)
  // Deprecated IPv4-compatible IPv6 (::a.b.c.d): ipaddr.js calls it unicast; never connect.
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).parts.slice(0, 6).every((p) => p === 0)) {
    return false
  }
  const address =
    parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ? (parsed as ipaddr.IPv6).toIPv4Address()
      : parsed
  return address.range() === 'unicast'
}
