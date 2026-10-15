import ipaddr from 'ipaddr.js'

/**
 * The unit limits count by: an IPv4 address, or a whole IPv6 /64 — one subscriber usually gets
 * a /64, so counting single IPv6 addresses would hand an attacker millions of fresh ones.
 */
export const addressBucket = (address: string): string => {
  if (!ipaddr.isValid(address)) return address
  const parsed = ipaddr.process(address)
  if (parsed.kind() === 'ipv4') return parsed.toString()
  const parts = (parsed as ipaddr.IPv6).parts.slice(0, 4)
  return `${parts.map((part) => part.toString(16)).join(':')}::/64`
}
