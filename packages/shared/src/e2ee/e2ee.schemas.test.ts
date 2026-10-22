import { describe, expect, it } from 'vitest'

import { createMessageRequestSchema, updateMessageRequestSchema } from '../messages/message.schemas'
import {
  postCommitRequestSchema,
  registerDeviceRequestSchema,
  setUserKeyRequestSchema,
  uploadKeyPackagesRequestSchema,
} from './e2ee.schemas'

const KEY = Buffer.alloc(32, 7).toString('base64')

describe('e2ee schemas', () => {
  it('replace the user key only with the password (and a code when there is 2FA)', () => {
    expect(setUserKeyRequestSchema.safeParse({ publicKey: KEY }).success).toBe(true)
    expect(setUserKeyRequestSchema.safeParse({ publicKey: KEY, replace: true }).success).toBe(false)
    expect(
      setUserKeyRequestSchema.parse({
        publicKey: KEY,
        replace: true,
        password: 'secret',
        code: '123 456',
      }),
    ).toEqual({ publicKey: KEY, replace: true, password: 'secret', code: '123456' })
  })

  it('register a device with a 32-byte key', () => {
    expect(
      registerDeviceRequestSchema.safeParse({ name: ' Ноутбук ', signaturePublicKey: KEY }).success,
    ).toBe(true)
    expect(
      registerDeviceRequestSchema.safeParse({
        name: 'x',
        signaturePublicKey: Buffer.alloc(16).toString('base64'),
      }).success,
    ).toBe(false)
    expect(
      registerDeviceRequestSchema.safeParse({ name: 'x', signaturePublicKey: 'не base64!' })
        .success,
    ).toBe(false)
  })

  it('cap key package uploads', () => {
    expect(
      uploadKeyPackagesRequestSchema.safeParse({ packages: [KEY], lastResort: KEY }).success,
    ).toBe(true)
    expect(
      uploadKeyPackagesRequestSchema.safeParse({ packages: Array(101).fill(KEY) }).success,
    ).toBe(false)
  })

  it('pair a Welcome with its targets', () => {
    const commit = { deviceId: '1', epoch: 0, commit: KEY }
    expect(postCommitRequestSchema.safeParse(commit).success).toBe(true)
    expect(
      postCommitRequestSchema.safeParse({
        ...commit,
        welcome: KEY,
        welcomeTargets: [{ deviceId: '2', keyPackageId: '3' }],
      }).success,
    ).toBe(true)
    expect(postCommitRequestSchema.safeParse({ ...commit, welcome: KEY }).success).toBe(false)
  })

  it('send encrypted messages without plain content', () => {
    expect(createMessageRequestSchema.safeParse({ ciphertext: KEY }).success).toBe(true)
    expect(
      createMessageRequestSchema.safeParse({ ciphertext: KEY, content: 'открыто' }).success,
    ).toBe(false)
    expect(updateMessageRequestSchema.safeParse({ ciphertext: KEY }).success).toBe(true)
    expect(updateMessageRequestSchema.safeParse({ ciphertext: KEY, content: 'x' }).success).toBe(
      false,
    )
    expect(updateMessageRequestSchema.safeParse({}).success).toBe(false)
  })
})
