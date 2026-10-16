import { describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  canManageRole,
  CHANNEL_PERMISSIONS,
  computeBasePermissions,
  computeChannelPermissions,
  DEFAULT_EVERYONE_PERMISSIONS,
  has,
  highestPosition,
  parsePermissions,
  Permission,
  serializePermissions,
} from './permissions'

import type { PermissionContext } from './permissions'

const GUILD = 'g1'
const role = (id: string, position: number, permissions: bigint) => ({ id, position, permissions })

const context = (overrides: Partial<PermissionContext> = {}): PermissionContext => ({
  guildId: GUILD,
  ownerId: 'owner',
  userId: 'alice',
  memberRoleIds: [],
  roles: [role(GUILD, 0, Permission.ViewChannel | Permission.SendMessages)],
  ...overrides,
})

describe('flags', () => {
  it('are distinct single bits', () => {
    const values = Object.values(Permission)
    expect(new Set(values).size).toBe(values.length)
    for (const value of values) expect(value & (value - 1n)).toBe(0n)
  })

  it('ALL contains every flag; channel flags are a subset', () => {
    for (const value of Object.values(Permission)) expect(has(ALL_PERMISSIONS, value)).toBe(true)
    expect(CHANNEL_PERMISSIONS & ~ALL_PERMISSIONS).toBe(0n)
    expect(has(CHANNEL_PERMISSIONS, Permission.Administrator)).toBe(false)
    expect(has(CHANNEL_PERMISSIONS, Permission.ViewChannel)).toBe(true)
  })

  it('lets everyone read, write and invite by default, but not manage', () => {
    expect(has(DEFAULT_EVERYONE_PERMISSIONS, Permission.ViewChannel)).toBe(true)
    expect(has(DEFAULT_EVERYONE_PERMISSIONS, Permission.SendMessages)).toBe(true)
    expect(has(DEFAULT_EVERYONE_PERMISSIONS, Permission.CreateInvite)).toBe(true)
    expect(has(DEFAULT_EVERYONE_PERMISSIONS, Permission.ManageChannels)).toBe(false)
  })

  it('serialize as decimal strings and parse safely', () => {
    expect(serializePermissions(Permission.ViewChannel | Permission.SendMessages)).toBe(
      String(Permission.ViewChannel | Permission.SendMessages),
    )
    expect(parsePermissions('768')).toBe(768n)
    expect(parsePermissions('')).toBe(0n)
    expect(parsePermissions('abc')).toBe(0n)
    expect(parsePermissions('-5')).toBe(0n)
    // Unknown high bits are dropped, never granted.
    expect(parsePermissions(String(1n << 60n))).toBe(0n)
  })
})

describe('computeBasePermissions', () => {
  it('starts from @everyone and adds the member’s roles', () => {
    const permissions = computeBasePermissions(
      context({
        memberRoleIds: ['mod'],
        roles: [role(GUILD, 0, Permission.ViewChannel), role('mod', 1, Permission.ManageMessages)],
      }),
    )
    expect(permissions).toBe(Permission.ViewChannel | Permission.ManageMessages)
  })

  it('ignores roles the member does not have', () => {
    const permissions = computeBasePermissions(
      context({ roles: [role(GUILD, 0, 0n), role('mod', 1, Permission.ManageMessages)] }),
    )
    expect(permissions).toBe(0n)
  })

  it('gives the owner everything', () => {
    expect(computeBasePermissions(context({ userId: 'owner', roles: [role(GUILD, 0, 0n)] }))).toBe(
      ALL_PERMISSIONS,
    )
  })

  it('gives administrators everything', () => {
    const permissions = computeBasePermissions(
      context({
        memberRoleIds: ['admin'],
        roles: [role(GUILD, 0, 0n), role('admin', 1, Permission.Administrator)],
      }),
    )
    expect(permissions).toBe(ALL_PERMISSIONS)
  })

  it('handles a missing @everyone role as no permissions', () => {
    expect(computeBasePermissions(context({ roles: [] }))).toBe(0n)
  })
})

describe('computeChannelPermissions', () => {
  const view = Permission.ViewChannel
  const send = Permission.SendMessages

  it('uses the base permissions when the channel has no overwrites', () => {
    expect(computeChannelPermissions(context(), [])).toBe(view | send)
  })

  it('applies @everyone, then role, then member overwrites, deny before allow at each level', () => {
    const ctx = context({
      memberRoleIds: ['a', 'b'],
      roles: [role(GUILD, 0, view | send), role('a', 1, 0n), role('b', 2, 0n)],
    })
    const overwrites = [
      // @everyone cannot write…
      { targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: send },
      // …role a may again; role b denies it — roles are combined, allow wins over deny at the role level.
      { targetType: 'role' as const, targetId: 'a', allow: send, deny: 0n },
      { targetType: 'role' as const, targetId: 'b', allow: 0n, deny: send },
    ]
    expect(has(computeChannelPermissions(ctx, overwrites), send)).toBe(true)

    // A member overwrite has the final word.
    const memberDeny = [
      ...overwrites,
      { targetType: 'member' as const, targetId: 'alice', allow: 0n, deny: send },
    ]
    expect(has(computeChannelPermissions(ctx, memberDeny), send)).toBe(false)
  })

  it('hides the channel and everything in it without VIEW_CHANNEL', () => {
    const overwrites = [{ targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: view }]
    expect(computeChannelPermissions(context(), overwrites)).toBe(0n)
  })

  it('lets a role see a private channel', () => {
    const ctx = context({
      memberRoleIds: ['staff'],
      roles: [role(GUILD, 0, view | send), role('staff', 1, 0n)],
    })
    const overwrites = [
      { targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: view },
      { targetType: 'role' as const, targetId: 'staff', allow: view, deny: 0n },
    ]
    expect(computeChannelPermissions(ctx, overwrites)).toBe(view | send)
    expect(computeChannelPermissions(context(), overwrites)).toBe(0n)
  })

  it('without SEND_MESSAGES, also drops what depends on sending', () => {
    const ctx = context({
      roles: [role(GUILD, 0, view | send | Permission.AttachFiles | Permission.MentionEveryone)],
    })
    const overwrites = [{ targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: send }]
    expect(computeChannelPermissions(ctx, overwrites)).toBe(view)
  })

  it('without CONNECT, drops voice abilities', () => {
    const ctx = context({
      roles: [role(GUILD, 0, view | Permission.Connect | Permission.Speak | Permission.Video)],
    })
    const overwrites = [
      { targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: Permission.Connect },
    ]
    expect(computeChannelPermissions(ctx, overwrites)).toBe(view)
  })

  it('keeps voice abilities while CONNECT is allowed', () => {
    const voice = view | Permission.Connect | Permission.Speak
    expect(computeChannelPermissions(context({ roles: [role(GUILD, 0, voice)] }), [])).toBe(voice)
  })

  it('never restricts the owner or administrators', () => {
    const overwrites = [{ targetType: 'role' as const, targetId: GUILD, allow: 0n, deny: view }]
    expect(computeChannelPermissions(context({ userId: 'owner' }), overwrites)).toBe(
      ALL_PERMISSIONS,
    )
  })

  it('ignores overwrites for roles the member lacks and for other members', () => {
    const overwrites = [
      { targetType: 'role' as const, targetId: 'other-role', allow: 0n, deny: view },
      { targetType: 'member' as const, targetId: 'bob', allow: 0n, deny: view },
    ]
    expect(computeChannelPermissions(context(), overwrites)).toBe(view | send)
  })
})

describe('role hierarchy', () => {
  const roles = [
    role(GUILD, 0, 0n),
    role('mod', 1, Permission.ManageRoles),
    role('admin', 5, 0n),
    role('vip', 3, 0n),
  ]

  it('finds the member’s highest role position', () => {
    expect(highestPosition(['mod', 'vip'], roles)).toBe(3)
    expect(highestPosition([], roles)).toBe(0)
  })

  it('lets members with MANAGE_ROLES manage only roles below their highest', () => {
    const mod = context({ memberRoleIds: ['mod', 'vip'], roles })
    expect(canManageRole(mod, role('mod', 1, 0n))).toBe(true)
    expect(canManageRole(mod, role('vip', 3, 0n))).toBe(false)
    expect(canManageRole(mod, role('admin', 5, 0n))).toBe(false)
  })

  it('requires MANAGE_ROLES', () => {
    const plain = context({ memberRoleIds: ['vip'], roles })
    expect(canManageRole(plain, role('x', 1, 0n))).toBe(false)
  })

  it('lets the owner manage every role except @everyone’s place', () => {
    const owner = context({ userId: 'owner', roles })
    expect(canManageRole(owner, role('admin', 5, 0n))).toBe(true)
  })
})

describe('timeouts', () => {
  const READ_ONLY = Permission.ViewChannel | Permission.ReadMessageHistory

  it('leave a timed-out member only seeing and reading, server-wide and in channels', () => {
    // A timeout only takes away: what is left is reading, if the member could read at all.
    const timedOut = context({
      timedOut: true,
      roles: [role(GUILD, 0, READ_ONLY | Permission.SendMessages | Permission.AddReactions)],
    })

    expect(computeBasePermissions(timedOut)).toBe(READ_ONLY)
    const overwrites = [
      {
        targetType: 'member' as const,
        targetId: timedOut.userId,
        allow: Permission.SendMessages | Permission.Connect,
        deny: 0n,
      },
    ]
    expect(computeChannelPermissions(timedOut, overwrites)).toBe(READ_ONLY)
  })

  it('never apply to the owner or administrators', () => {
    expect(computeBasePermissions(context({ timedOut: true, userId: 'owner' }))).toBe(
      ALL_PERMISSIONS,
    )
  })
})

describe('server rules not yet accepted', () => {
  const READ_ONLY = Permission.ViewChannel | Permission.ReadMessageHistory

  it('leave the newcomer reading only, until the rules are accepted', () => {
    const roles = [role(GUILD, 0, READ_ONLY | Permission.SendMessages | Permission.Connect)]
    const pending = context({ pending: true, roles })

    expect(computeBasePermissions(pending)).toBe(READ_ONLY)
    expect(computeChannelPermissions(pending, [])).toBe(READ_ONLY)
    expect(computeBasePermissions(context({ roles }))).toBe(
      READ_ONLY | Permission.SendMessages | Permission.Connect,
    )
  })

  it('never hold back the owner', () => {
    expect(computeBasePermissions(context({ pending: true, userId: 'owner' }))).toBe(
      ALL_PERMISSIONS,
    )
  })
})
