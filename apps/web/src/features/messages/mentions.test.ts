import { describe, expect, it } from 'vitest'

import { testMessage } from '../../test/fake-api'
import { mentionsMe } from './mentions'

const ME = '100'

describe('mentionsMe', () => {
  it.each([
    ['me by name', { users: [ME], roles: [], everyone: false, here: false }, true],
    ['one of my roles', { users: [], roles: ['7'], everyone: false, here: false }, true],
    ['everyone', { users: [], roles: [], everyone: true, here: false }, true],
    ['here', { users: [], roles: [], everyone: false, here: true }, true],
    ['someone else', { users: ['200'], roles: ['8'], everyone: false, here: false }, false],
  ])('is %s → %s', (_case, mentions, expected) => {
    expect(mentionsMe(testMessage('1', { mentions }), ME, ['7'])).toBe(expected)
  })

  it('never counts my own messages', () => {
    const own = testMessage('1', {
      author: { id: ME, username: 'alice', displayName: null, avatarUrl: null },
      mentions: { users: [ME], roles: [], everyone: true, here: false },
    })
    expect(mentionsMe(own, ME, [])).toBe(false)
  })
})
