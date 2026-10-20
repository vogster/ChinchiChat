import { describe, expect, it } from 'vitest'

import { changeEmailRequestSchema } from './email-change.schemas'

describe('changeEmailRequestSchema', () => {
  it('normalises the address and takes an optional code', () => {
    expect(
      changeEmailRequestSchema.parse({
        email: ' New@Example.COM ',
        password: 'secret',
        code: '123 456',
      }),
    ).toEqual({ email: 'new@example.com', password: 'secret', code: '123456' })
    expect(changeEmailRequestSchema.parse({ email: 'a@b.co', password: 'x' })).toEqual({
      email: 'a@b.co',
      password: 'x',
    })
  })

  it('needs a real address and a password', () => {
    expect(changeEmailRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false)
    expect(changeEmailRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(
      false,
    )
  })
})
