import { describe, expect, it } from 'vitest'

import { resolveMediaUrl } from './media-url'

describe('resolveMediaUrl', () => {
  it('points a server path at the instance when the page lives elsewhere', () => {
    expect(resolveMediaUrl('https://chat.example.com', '/api/v1/avatars/1/2.webp')).toBe(
      'https://chat.example.com/api/v1/avatars/1/2.webp',
    )
    expect(resolveMediaUrl('https://chat.example.com/', '/api/v1/avatars/1/2.webp')).toBe(
      'https://chat.example.com/api/v1/avatars/1/2.webp',
    )
  })

  it('leaves paths alone in a browser tab and absolute addresses everywhere', () => {
    expect(resolveMediaUrl(null, '/api/v1/avatars/1/2.webp')).toBe('/api/v1/avatars/1/2.webp')
    expect(resolveMediaUrl('https://chat.example.com', 'https://cdn.example.org/x.png')).toBe(
      'https://cdn.example.org/x.png',
    )
    expect(resolveMediaUrl('https://chat.example.com', 'blob:http://tauri.localhost/1')).toBe(
      'blob:http://tauri.localhost/1',
    )
    expect(resolveMediaUrl('https://chat.example.com', '//evil.example/x.png')).toBe(
      '//evil.example/x.png',
    )
    expect(resolveMediaUrl('https://chat.example.com', null)).toBeNull()
  })
})
