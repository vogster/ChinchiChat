import { describe, expect, it } from 'vitest'

import {
  createRoleRequestSchema,
  putOverwriteRequestSchema,
  reorderRolesRequestSchema,
  updateRoleRequestSchema,
} from './role.schemas'

describe('role request schemas', () => {
  it('fills in defaults for a new role', () => {
    expect(createRoleRequestSchema.parse({})).toEqual({
      name: 'new role',
      color: 0,
      permissions: '0',
      hoist: false,
      mentionable: false,
    })
  })

  it.each([
    { name: '' },
    { color: 0x1000000 },
    { color: -1 },
    { permissions: '1.5' },
    { permissions: 'x' },
  ])('rejects %j', (body) => {
    expect(createRoleRequestSchema.safeParse(body).success).toBe(false)
  })

  it('requires something to update', () => {
    expect(updateRoleRequestSchema.safeParse({}).success).toBe(false)
    expect(updateRoleRequestSchema.parse({ name: ' Mods ' })).toEqual({ name: 'Mods' })
  })

  it('never lets a role move to @everyone’s position', () => {
    expect(reorderRolesRequestSchema.safeParse([{ id: '1', position: 0 }]).success).toBe(false)
    expect(
      reorderRolesRequestSchema.safeParse([
        { id: '1', position: 1 },
        { id: '1', position: 2 },
      ]).success,
    ).toBe(false)
  })

  it('validates overwrites', () => {
    expect(
      putOverwriteRequestSchema.parse({ targetType: 'role', allow: '256', deny: '0' }),
    ).toEqual({
      targetType: 'role',
      allow: '256',
      deny: '0',
    })
    expect(
      putOverwriteRequestSchema.safeParse({ targetType: 'everyone', allow: '0', deny: '0' })
        .success,
    ).toBe(false)
  })
})
