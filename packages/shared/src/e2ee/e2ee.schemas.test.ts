import { describe, expect, it } from 'vitest'

import { createMessageRequestSchema, updateMessageRequestSchema } from '../messages/message.schemas'
import {
  postCommitRequestSchema,
  registerDeviceRequestSchema,
  uploadKeyPackagesRequestSchema,
} from './e2ee.schemas'

const KEY = Buffer.alloc(32, 7).toString('base64')

describe('e2ee schemas', () => {
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
