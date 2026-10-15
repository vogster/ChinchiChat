import { sortRoles } from '../permissions/permissions'

import type { ReorderRolesRequest, Role } from '@chinchi/shared'

/**
 * The reorder request for dropping `draggedId` onto `targetId` (raising lands above the target,
 * lowering below it). The roles in between trade places among their own positions, so every one
 * of them must be within the user's reach; otherwise, or when nothing would change, returns [].
 */
export const planRoleMove = (
  roles: readonly Role[],
  draggedId: string,
  targetId: string,
  movable: (role: Role) => boolean,
): ReorderRolesRequest => {
  const sorted = sortRoles(roles)
  const from = sorted.findIndex((role) => role.id === draggedId)
  const to = sorted.findIndex((role) => role.id === targetId)
  if (from === -1 || to === -1 || from === to) return []

  const slice = sorted.slice(Math.min(from, to), Math.max(from, to) + 1)
  if (!slice.every(movable)) return []
  const dragged = sorted[from] as Role
  const rest = slice.filter((role) => role !== dragged)
  const order = from < to ? [...rest, dragged] : [dragged, ...rest]

  return order.flatMap((role, index) => {
    const position = (slice[index] as Role).position
    return role.position === position ? [] : [{ id: role.id, position }]
  })
}
