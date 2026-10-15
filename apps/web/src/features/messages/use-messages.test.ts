import { describe, expect, it } from 'vitest'

import { isUnread } from './use-messages'

describe('isUnread', () => {
  it.each([
    [null, undefined, false],
    [null, '5', false],
    ['5', undefined, true],
    ['10', '9', true],
    ['9', '10', false],
    ['10', '10', false],
  ])('last %j vs read %j → %s', (last, read, expected) => {
    expect(isUnread(last, read)).toBe(expected)
  })
})
