import { describe, expect, it } from 'vitest'

import { safeRedirect } from './redirect'

describe('safeRedirect', () => {
  it.each(['/', '/channels/1', '/settings?tab=sessions#x'])('keeps internal path %j', (path) => {
    expect(safeRedirect(path)).toBe(path)
  })

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/\t/evil.example',
    '/\n/evil.example',
    '/%09/evil.example',
  ])('replaces unsafe target %j with /', (target) => {
    expect(safeRedirect(target)).toBe('/')
  })
})
