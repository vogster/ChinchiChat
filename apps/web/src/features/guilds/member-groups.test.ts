import { describe, expect, it } from 'vitest'

import { testGuild, testMembers } from '../../test/fake-api'
import { groupMembers } from './member-groups'

import type { Member, Role } from '@chinchi/shared'

const member = (id: string, roleIds: string[]): Member => ({
  ...(testMembers[0] as Member),
  user: { ...(testMembers[0] as Member).user, id, username: id },
  roleIds,
})

const admins: Role = { ...(testGuild.roles[1] as Role), id: '600', name: 'Admins', position: 5 }
const quiet: Role = { ...(testGuild.roles[1] as Role), id: '700', hoist: false, position: 9 }
const roles = [...testGuild.roles, admins, quiet]

describe('groupMembers', () => {
  it('puts online members under their highest hoisted role, then online, then offline', () => {
    const members = [
      member('a', ['510', '600']),
      member('b', ['510']),
      member('c', ['700']),
      member('d', ['600']),
    ]
    const status = (m: Member) => (m.user.id === 'd' ? 'offline' : 'online')

    const groups = groupMembers(members, roles, status)

    expect(
      groups.map((g) => [
        g.kind === 'role' ? g.role.name : g.kind,
        g.members.map((m) => m.user.id),
      ]),
    ).toEqual([
      ['Admins', ['a']],
      ['Модераторы', ['b']],
      ['online', ['c']],
      ['offline', ['d']],
    ])
  })

  it('leaves out empty groups', () => {
    expect(groupMembers([member('x', [])], roles, () => 'offline').map((g) => g.kind)).toEqual([
      'offline',
    ])
  })
})
