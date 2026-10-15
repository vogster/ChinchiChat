import { describe, expect, it } from 'vitest'

import { planRoleMove } from './role-order'

import type { Role } from '@chinchi/shared'

const role = (id: string, position: number): Role => ({
  id,
  guildId: '1',
  name: id,
  color: 0,
  hoist: false,
  mentionable: false,
  position,
  permissions: '0',
})

const everyone = role('everyone', 0)
const roles = [everyone, role('low', 1), role('mid', 2), role('high', 3), role('top', 4)]
const movable = (r: Role) => r.id !== 'everyone' && r.id !== 'top'

describe('planRoleMove', () => {
  it('raises a role above the target, shifting the ones in between down', () => {
    expect(planRoleMove(roles, 'low', 'high', movable)).toEqual([
      { id: 'low', position: 3 },
      { id: 'high', position: 2 },
      { id: 'mid', position: 1 },
    ])
  })

  it('lowers a role below the target', () => {
    expect(planRoleMove(roles, 'high', 'mid', movable)).toEqual([
      { id: 'mid', position: 3 },
      { id: 'high', position: 2 },
    ])
  })

  it('refuses moves across roles out of reach, or onto itself', () => {
    expect(planRoleMove(roles, 'high', 'top', movable)).toEqual([])
    expect(planRoleMove(roles, 'low', 'everyone', movable)).toEqual([])
    expect(planRoleMove(roles, 'mid', 'mid', movable)).toEqual([])
    expect(planRoleMove(roles, 'top', 'low', movable)).toEqual([])
  })
})
