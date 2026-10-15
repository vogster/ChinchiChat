import { describe, expect, it } from 'vitest'

import { inviteUrl, parseInviteCode } from './invite-link'

describe('parseInviteCode', () => {
  it.each([
    ['AbCd1234', 'AbCd1234'],
    ['  AbCd1234 ', 'AbCd1234'],
    ['https://chat.example.com/invite/AbCd1234', 'AbCd1234'],
    ['http://localhost:5173/invite/XyZ98765?utm=1', 'XyZ98765'],
    ['chat.example.com/invite/AbCd1234/', 'AbCd1234'],
  ])('%j → %j', (input, expected) => {
    expect(parseInviteCode(input)).toBe(expected)
  })

  it.each(['', '   ', 'https://chat.example.com/', 'not a code!', 'a'.repeat(17)])(
    'rejects %j',
    (input) => {
      expect(parseInviteCode(input)).toBeNull()
    },
  )
})

describe('inviteUrl', () => {
  it('builds a link on the current origin', () => {
    expect(inviteUrl('AbCd1234', 'https://chat.example.com')).toBe(
      'https://chat.example.com/invite/AbCd1234',
    )
  })
})
