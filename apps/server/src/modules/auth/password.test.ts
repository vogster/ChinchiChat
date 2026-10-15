import { describe, expect, it } from 'vitest'

import { ARGON2_PARAMS, hashPassword, needsRehash, verifyPassword } from './password'

describe('password hashing', () => {
  it('produces a PHC-formatted argon2id hash with the configured parameters', async () => {
    const hash = await hashPassword('correct horse')

    expect(hash).toMatch(
      new RegExp(
        `^\\$argon2id\\$v=19\\$m=${ARGON2_PARAMS.memory},t=${ARGON2_PARAMS.passes},p=${ARGON2_PARAMS.parallelism}\\$[A-Za-z0-9+/]+\\$[A-Za-z0-9+/]+$`,
      ),
    )
  })

  it('uses a random salt per hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')])
    expect(a).not.toBe(b)
  })

  it('verifies the correct password', async () => {
    const hash = await hashPassword('correct horse')
    await expect(verifyPassword(hash, 'correct horse')).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse')
    await expect(verifyPassword(hash, 'Correct horse')).resolves.toBe(false)
  })

  it.each(['', 'plaintext', '$argon2i$v=19$m=1,t=1,p=1$AAAA$AAAA', '$argon2id$v=19$m=x$a$b'])(
    'treats malformed hash %j as non-matching',
    async (hash) => {
      await expect(verifyPassword(hash, 'anything')).resolves.toBe(false)
    },
  )

  it('flags hashes made with different parameters for rehash', async () => {
    const current = await hashPassword('pw')
    const weaker = current.replace(`m=${ARGON2_PARAMS.memory}`, 'm=4096')

    expect(needsRehash(current)).toBe(false)
    expect(needsRehash(weaker)).toBe(true)
    expect(needsRehash('garbage')).toBe(true)
  })
})
