import { ALL_PERMISSIONS, Permission } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { testGuild, testUser } from '../../test/fake-api'
import {
  basePermissions,
  can,
  canManageGuildRole,
  channelPermissions,
  grantablePermissions,
  memberColor,
  sortRoles,
  toHexColor,
} from './permissions'

import type { Role } from '@chinchi/shared'

const member = { ...testGuild, ownerId: 'someone-else' }

describe('client-side permissions', () => {
  it('gives the owner everything', () => {
    expect(can(basePermissions(testGuild, testUser.id), Permission.Administrator)).toBe(true)
  })

  it('uses @everyone and the member’s roles', () => {
    expect(can(basePermissions(member, testUser.id), Permission.SendMessages)).toBe(true)
    expect(can(basePermissions(member, testUser.id), Permission.ManageMessages)).toBe(false)
    expect(
      can(
        basePermissions({ ...member, myRoleIds: ['510'] }, testUser.id),
        Permission.ManageMessages,
      ),
    ).toBe(true)
  })

  it('applies channel overwrites', () => {
    const channel = {
      ...(testGuild.channels[2] as (typeof testGuild.channels)[number]),
      permissionOverwrites: [
        {
          targetType: 'role' as const,
          targetId: testGuild.id,
          allow: '0',
          deny: String(Permission.SendMessages),
        },
      ],
    }
    expect(can(channelPermissions(member, channel, testUser.id), Permission.SendMessages)).toBe(
      false,
    )
    expect(can(channelPermissions(member, channel, testUser.id), Permission.ViewChannel)).toBe(true)
  })

  it('lets owners and administrators grant everything, others only what they have', () => {
    expect(grantablePermissions(testGuild, testUser.id)).toBe(ALL_PERMISSIONS)
    const moderator = { ...member, myRoleIds: ['510'] }
    const grantable = grantablePermissions(moderator, testUser.id)
    expect(can(grantable, Permission.KickMembers)).toBe(true)
    expect(can(grantable, Permission.BanMembers)).toBe(false)

    const admin = {
      ...moderator,
      roles: moderator.roles.map((role) =>
        role.id === '510' ? { ...role, permissions: String(Permission.Administrator) } : role,
      ),
    }
    expect(grantablePermissions(admin, testUser.id)).toBe(ALL_PERMISSIONS)
  })

  it('only lets members manage roles below their highest one', () => {
    const [everyone, moderators] = testGuild.roles as [Role, Role]
    const lowRole = { ...moderators, id: '520', position: 0 }
    const manager = {
      ...member,
      myRoleIds: ['510'],
      roles: [everyone, { ...moderators, permissions: String(Permission.ManageRoles) }],
    }
    expect(canManageGuildRole(testGuild, testUser.id, moderators)).toBe(true)
    expect(canManageGuildRole(manager, testUser.id, moderators)).toBe(false)
    expect(canManageGuildRole(manager, testUser.id, lowRole)).toBe(true)
    expect(canManageGuildRole(member, testUser.id, lowRole)).toBe(false)
  })

  it('paints names with the highest colored role', () => {
    expect(memberColor(testGuild.roles, ['510'])).toBe(0x2ecc71)
    expect(memberColor(testGuild.roles, [])).toBe(0)
    expect(toHexColor(0x2ecc71)).toBe('#2ecc71')
    expect(toHexColor(0xff)).toBe('#0000ff')
  })

  it('sorts roles highest first', () => {
    expect(sortRoles(testGuild.roles).map((r) => r.name)).toEqual(['Модераторы', '@everyone'])
  })
})
