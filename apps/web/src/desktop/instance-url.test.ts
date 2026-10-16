import { describe, expect, it } from 'vitest'

import { normalizeInstanceUrl } from './instance-url'

describe('normalizeInstanceUrl', () => {
  it('turns what people type into the origin of an instance', () => {
    expect(normalizeInstanceUrl('chat.example.com')).toBe('https://chat.example.com')
    expect(normalizeInstanceUrl('  https://chat.example.com/  ')).toBe('https://chat.example.com')
    expect(normalizeInstanceUrl('https://chat.example.com/login?redirect=%2F')).toBe(
      'https://chat.example.com',
    )
    expect(normalizeInstanceUrl('HTTPS://Chat.Example.com:8443')).toBe(
      'https://chat.example.com:8443',
    )
  })

  it('allows plain http only for local development hosts', () => {
    expect(normalizeInstanceUrl('http://localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeInstanceUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(normalizeInstanceUrl('http://chat.example.com')).toBeNull()
  })

  it('rejects what is not an address', () => {
    expect(normalizeInstanceUrl('')).toBeNull()
    expect(normalizeInstanceUrl('not a url')).toBeNull()
    expect(normalizeInstanceUrl('ftp://chat.example.com')).toBeNull()
    expect(normalizeInstanceUrl('https://user:pass@chat.example.com')).toBeNull()
  })
})
