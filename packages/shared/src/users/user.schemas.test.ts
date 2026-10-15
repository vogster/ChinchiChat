import { describe, expect, it } from 'vitest'

import { updateProfileRequestSchema } from './user.schemas'

describe('updateProfileRequestSchema', () => {
  it('trims the display name', () => {
    expect(updateProfileRequestSchema.parse({ displayName: '  Алиса ' })).toEqual({
      displayName: 'Алиса',
    })
  })

  it('allows clearing the display name with null', () => {
    expect(updateProfileRequestSchema.parse({ displayName: null })).toEqual({ displayName: null })
  })

  it.each([
    {},
    { displayName: '' },
    { displayName: 'x'.repeat(33) },
    { displayName: 'a', pronouns: 'x' },
  ])('rejects %j', (body) => {
    expect(updateProfileRequestSchema.safeParse(body).success).toBe(false)
  })
})
