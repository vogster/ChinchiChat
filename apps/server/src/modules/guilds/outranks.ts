import { highestPosition } from '@chinchi/shared'

import type { GuildAccess } from './guild-access'

/**
 * Whether `actor` may act on `target` (moderate, rename): the owner may act on anyone, others
 * only on members whose highest role is below their own. Nobody acts on the owner.
 */
export const outranks = (actor: GuildAccess, target: GuildAccess): boolean =>
  actor.isOwner ||
  (!target.isOwner &&
    highestPosition(actor.memberRoleIds, actor.roles) >
      highestPosition(target.memberRoleIds, target.roles))
