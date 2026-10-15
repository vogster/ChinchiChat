import { Permission } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { PERMISSION_GROUPS, channelPermissionGroups } from './permission-groups'

describe('permission groups', () => {
  it('list every permission exactly once', () => {
    const listed = PERMISSION_GROUPS.flatMap((group) => group.permissions)
    expect(new Set(listed).size).toBe(listed.length)
    expect([...listed].sort()).toEqual(Object.keys(Permission).sort())
  })

  it('offer only channel-level permissions for channels, relevant to the type', () => {
    const text = channelPermissionGroups('text').flatMap((g) => g.permissions)
    expect(text).toContain('SendMessages')
    expect(text).not.toContain('Connect')
    expect(text).not.toContain('Administrator')
    expect(text).not.toContain('ManageGuild')

    expect(channelPermissionGroups('voice').flatMap((g) => g.permissions)).toContain('Speak')
    expect(channelPermissionGroups('category').map((g) => g.key)).toEqual([
      'general',
      'members',
      'text',
      'voice',
    ])
  })
})
