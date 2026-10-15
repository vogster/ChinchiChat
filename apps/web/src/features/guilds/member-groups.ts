import { sortRoles } from '../permissions/permissions'

import type { Member, PresenceStatus, Role } from '@chinchi/shared'

export type MemberGroup =
  | { readonly kind: 'role'; readonly role: Role; readonly members: readonly Member[] }
  | { readonly kind: 'online' | 'offline'; readonly members: readonly Member[] }

/**
 * Discord's member list: online members under their highest hoisted role (highest first), the
 * remaining online members, then everyone offline. Empty groups are left out.
 */
export const groupMembers = (
  members: readonly Member[],
  roles: readonly Role[],
  statusOf: (member: Member) => PresenceStatus,
): MemberGroup[] => {
  const hoisted = sortRoles(roles.filter((role) => role.hoist))
  const online = members.filter((m) => statusOf(m) !== 'offline')
  const groupOf = (member: Member) => hoisted.find((role) => member.roleIds.includes(role.id))

  const groups: MemberGroup[] = [
    ...hoisted.map((role) => ({
      kind: 'role' as const,
      role,
      members: online.filter((m) => groupOf(m)?.id === role.id),
    })),
    { kind: 'online', members: online.filter((m) => groupOf(m) === undefined) },
    { kind: 'offline', members: members.filter((m) => statusOf(m) === 'offline') },
  ]
  return groups.filter((group) => group.members.length > 0)
}
