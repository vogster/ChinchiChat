import { Permission } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { draftOf, EMPTY_DRAFT, sameDraft, stateOf, withState } from './overwrite-draft'

const VIEW = Permission.ViewChannel
const SEND = Permission.SendMessages

describe('overwrite drafts', () => {
  it('reads saved overwrites as bit fields', () => {
    expect(draftOf(undefined)).toEqual(EMPTY_DRAFT)
    expect(
      draftOf({ targetType: 'role', targetId: '1', allow: String(VIEW), deny: String(SEND) }),
    ).toEqual({ allow: VIEW, deny: SEND })
  })

  it('moves a permission between allow, deny and inherit', () => {
    const allowed = withState(EMPTY_DRAFT, VIEW, 'allow')
    expect(stateOf(allowed, VIEW)).toBe('allow')
    expect(stateOf(allowed, SEND)).toBe('inherit')

    const denied = withState(allowed, VIEW, 'deny')
    expect(denied).toEqual({ allow: 0n, deny: VIEW })
    expect(stateOf(denied, VIEW)).toBe('deny')

    expect(sameDraft(withState(denied, VIEW, 'inherit'), EMPTY_DRAFT)).toBe(true)
    expect(sameDraft(denied, EMPTY_DRAFT)).toBe(false)
  })
})
