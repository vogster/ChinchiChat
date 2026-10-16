import { describe, expect, it } from 'vitest'

import {
  displayNameSchema,
  emailSchema,
  loginRequestSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  USERNAME_MAX_LENGTH,
  usernameSchema,
} from './auth.schemas'

describe('usernameSchema', () => {
  it.each(['al', 'alice', 'alice_99', 'a.b', 'a'.repeat(USERNAME_MAX_LENGTH)])(
    'accepts %j',
    (v) => {
      expect(usernameSchema.parse(v)).toBe(v)
    },
  )

  it('normalizes case and surrounding whitespace', () => {
    expect(usernameSchema.parse('  Alice_B ')).toBe('alice_b')
  })

  it.each([
    'a',
    'a'.repeat(USERNAME_MAX_LENGTH + 1),
    'al ice',
    'алиса',
    'al-ice',
    'a..b',
    '.alice',
    'alice.',
    'al@ce',
  ])('rejects %j', (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(false)
  })
})

describe('emailSchema', () => {
  it('normalizes case and whitespace', () => {
    expect(emailSchema.parse('  Alice@Example.COM ')).toBe('alice@example.com')
  })

  it.each(['', 'alice', 'alice@', '@example.com', `${'a'.repeat(250)}@example.com`])(
    'rejects %j',
    (v) => {
      expect(emailSchema.safeParse(v).success).toBe(false)
    },
  )
})

describe('passwordSchema', () => {
  it('accepts passwords within bounds and keeps them verbatim', () => {
    const password = '  correct horse battery staple  '
    expect(passwordSchema.parse(password)).toBe(password)
  })

  it.each([
    'a'.repeat(PASSWORD_MIN_LENGTH - 1),
    'a'.repeat(PASSWORD_MAX_LENGTH + 1),
    ' '.repeat(PASSWORD_MIN_LENGTH),
  ])('rejects %j', (v) => {
    expect(passwordSchema.safeParse(v).success).toBe(false)
  })
})

describe('displayNameSchema', () => {
  it('trims and keeps unicode', () => {
    expect(displayNameSchema.parse('  Алиса 🌸 ')).toBe('Алиса 🌸')
  })

  it.each(['', '   ', 'x'.repeat(33)])('rejects %j', (v) => {
    expect(displayNameSchema.safeParse(v).success).toBe(false)
  })
})

describe('registerRequestSchema', () => {
  it('parses a valid request', () => {
    expect(
      registerRequestSchema.parse({
        username: 'Alice',
        email: 'Alice@example.com',
        password: 'password123',
      }),
    ).toEqual({ username: 'alice', email: 'alice@example.com', password: 'password123' })
  })

  it('rejects unknown fields', () => {
    const result = registerRequestSchema.safeParse({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
      isAdmin: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('loginRequestSchema', () => {
  it('normalizes the login identifier', () => {
    expect(loginRequestSchema.parse({ login: ' Alice ', password: 'x' })).toEqual({
      login: 'alice',
      password: 'x',
    })
  })

  it('requires both fields', () => {
    expect(loginRequestSchema.safeParse({ login: 'alice' }).success).toBe(false)
    expect(loginRequestSchema.safeParse({ login: '', password: 'x' }).success).toBe(false)
  })
})

describe('resetPasswordRequestSchema', () => {
  it('accepts a base64url token and a valid password', () => {
    const token = 'A'.repeat(43)
    expect(resetPasswordRequestSchema.parse({ token, password: 'password123' })).toEqual({
      token,
      password: 'password123',
    })
  })

  it.each(['', 'short', 'has spaces in it but long enough', 'a/b+c'.repeat(10)])(
    'rejects token %j',
    (token) => {
      expect(resetPasswordRequestSchema.safeParse({ token, password: 'password123' }).success).toBe(
        false,
      )
    },
  )
})
