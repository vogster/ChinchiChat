import { describe, expect, it } from 'vitest'

import { passwordResetEmail, verificationEmail } from './templates'

describe('email templates', () => {
  it.each([
    ['verification', verificationEmail],
    ['password reset', passwordResetEmail],
  ])('%s email contains the link in text and html', (_name, template) => {
    const link = 'https://chat.example.com/x?token=abc_DEF-123'
    const message = template('alice@example.com', 'alice', link)

    expect(message.to).toBe('alice@example.com')
    expect(message.text).toContain(link)
    expect(message.html).toContain(`href="${link}"`)
  })

  it('escapes html in interpolated values', () => {
    const message = verificationEmail('a@example.com', '<b>x</b>', 'https://x.test/?a=1&b=2')

    expect(message.html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(message.html).toContain('a=1&amp;b=2')
    expect(message.html).not.toContain('<b>x</b>')
  })

  it("speaks the user's language: Russian by default, English when asked", () => {
    const link = 'https://chat.example.com/x?token=abc'
    expect(verificationEmail('a@example.com', 'alice', link).subject).toBe(
      'Chinchi: подтвердите email',
    )
    const english = verificationEmail('a@example.com', 'alice', link, 'en')
    expect(english.subject).toBe('Chinchi: confirm your email')
    expect(english.text).toContain('Hi, alice!')
    expect(passwordResetEmail('a@example.com', 'alice', link, 'en').subject).toBe(
      'Chinchi: reset your password',
    )
  })
})
