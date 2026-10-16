import { createPublicKey, verify } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createUserKey, signStatement, verifyStatement } from './user-key'

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

describe('user keys', () => {
  it('sign statements that their public half confirms, and no other key does', async () => {
    const mine = await createUserKey()
    const other = await createUserKey()

    const signature = await signStatement(mine.privateKey, 'chinchi-device-v1\n1\n7\nAAAA')

    expect(signature).toHaveLength(64)
    expect(await verifyStatement(mine.publicKey, 'chinchi-device-v1\n1\n7\nAAAA', signature)).toBe(
      true,
    )
    expect(await verifyStatement(mine.publicKey, 'chinchi-device-v1\n1\n8\nAAAA', signature)).toBe(
      false,
    )
    expect(await verifyStatement(other.publicKey, 'chinchi-device-v1\n1\n7\nAAAA', signature)).toBe(
      false,
    )
  })

  it('make plain Ed25519 signatures, as the server checks them', async () => {
    const { publicKey, privateKey } = await createUserKey()
    const signature = await signStatement(privateKey, 'утверждение')

    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey)]),
      format: 'der',
      type: 'spki',
    })
    expect(verify(null, Buffer.from('утверждение'), key, Buffer.from(signature))).toBe(true)
  })
})
