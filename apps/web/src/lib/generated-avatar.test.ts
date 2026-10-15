import { describe, expect, it } from 'vitest'

import { generatedAvatar } from './generated-avatar'

describe('generatedAvatar', () => {
  it('draws an SVG picture that depends only on the id and the kind', () => {
    const alice = generatedAvatar('user', '100')

    expect(alice).toMatch(/^data:image\/svg\+xml/)
    expect(generatedAvatar('user', '100')).toBe(alice)
    expect(generatedAvatar('user', '200')).not.toBe(alice)
    expect(generatedAvatar('guild', '100')).not.toBe(alice)
  })
})
