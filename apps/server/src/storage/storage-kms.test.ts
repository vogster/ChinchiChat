import { describe, expect, it, vi } from 'vitest'

import { ensureKmsKey } from './storage-kms'

const config = {
  endpoint: 'http://rustfs:9000',
  publicUrl: 'http://rustfs:9000',
  region: 'us-east-1',
  bucket: 'chinchi',
  accessKey: 'key',
  secretKey: 'secret',
  forcePathStyle: true,
  encryption: true,
}
const answering = (status: number, body = '') =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status }))

describe('storage KMS key', () => {
  it('asks the RustFS admin API for the default key, signed with the storage keys', async () => {
    const fetchImpl = answering(200)

    expect(await ensureKmsKey(config, fetchImpl)).toBe('created')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(url)).toBe('http://rustfs:9000/rustfs/admin/v3/kms/key/create?key-id=default')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=key\//,
    )
  })

  it.each([
    [409, 'KMS.AlreadyExistsException', 'exists'],
    [404, '', 'unsupported'],
  ] as const)('treats HTTP %i as %s', async (status, body, result) => {
    expect(await ensureKmsKey(config, answering(status, body))).toBe(result)
  })

  it('fails loudly when the storage refuses, without echoing its answer', async () => {
    await expect(ensureKmsKey(config, answering(403, 'secret details'))).rejects.toThrow(
      /HTTP 403\)$/,
    )
  })
})
