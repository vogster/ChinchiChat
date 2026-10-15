import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'

import { TEST_WEB_ORIGIN, testStorageConfig } from '../../test/storage'
import { createObjectStorage } from './object-storage'

const storage = createObjectStorage(testStorageConfig())
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

const upload = async (key: string, body: Uint8Array, contentType = 'image/png') => {
  const { url, headers } = await storage.presignPut(key, {
    contentType,
    size: body.byteLength,
    expiresIn: 60,
  })
  return fetch(url, { method: 'PUT', headers, body })
}

describe('object storage (RustFS)', () => {
  it('lists objects under a prefix in key order, a page at a time', async () => {
    const prefix = `list-${crypto.randomUUID()}/`
    for (const name of ['c', 'a', 'b']) await storage.put(`${prefix}${name}`, PNG, 'image/png')

    const first = await storage.list(prefix, { limit: 2 })
    expect(first.objects.map((o) => o.key)).toEqual([`${prefix}a`, `${prefix}b`])
    expect(first.objects[0]?.lastModified).toBeInstanceOf(Date)
    expect(first.more).toBe(true)

    const rest = await storage.list(prefix, { after: `${prefix}b`, limit: 2 })
    expect(rest.objects.map((o) => o.key)).toEqual([`${prefix}c`])
    expect(rest.more).toBe(false)
  })

  it('accepts a presigned upload and reports its size and type', async () => {
    const key = `test/${crypto.randomUUID()}`
    expect((await upload(key, PNG)).ok).toBe(true)

    expect(await storage.stat(key)).toEqual({ size: PNG.byteLength, contentType: 'image/png' })
    expect(await storage.readStart(key, 4)).toEqual(PNG.subarray(0, 4))
  })

  it('rejects an upload whose size differs from the signed one', async () => {
    const key = `test/${crypto.randomUUID()}`
    const { url, headers } = await storage.presignPut(key, {
      contentType: 'image/png',
      size: 4,
      expiresIn: 60,
    })
    const response = await fetch(url, { method: 'PUT', headers, body: PNG })
    expect(response.ok).toBe(false)
    expect(await storage.stat(key)).toBeNull()
  })

  it('serves a presigned download with the requested name and disposition', async () => {
    const key = `test/${crypto.randomUUID()}`
    await upload(key, PNG)
    const url = await storage.presignGet(key, {
      filename: 'кот.png',
      contentType: 'image/png',
      inline: false,
      expiresIn: 60,
    })

    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="_.png"; filename*=UTF-8''%D0%BA%D0%BE%D1%82.png`,
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it('signs downloads in fixed windows so URLs stay cacheable', async () => {
    const key = `test/${crypto.randomUUID()}`
    const options = {
      filename: 'a.png',
      contentType: 'image/png',
      inline: true,
      expiresIn: 60,
      signedAt: new Date('2026-01-01T00:00:00Z'),
    }
    expect(await storage.presignGet(key, options)).toBe(await storage.presignGet(key, options))
  })

  it('writes and reads whole objects', async () => {
    const key = `test/${crypto.randomUUID()}`
    await storage.put(key, PNG, 'image/webp')
    expect(await storage.read(key)).toEqual(PNG)
    expect(await storage.stat(key)).toEqual({ size: PNG.byteLength, contentType: 'image/webp' })
  })

  it('copies objects and reports a missing source as false', async () => {
    const key = `test/${crypto.randomUUID()}`
    const copy = `test/${crypto.randomUUID()}`
    await upload(key, PNG)

    expect(await storage.copy(key, copy)).toBe(true)
    expect(await storage.stat(copy)).toEqual({ size: PNG.byteLength, contentType: 'image/png' })
    expect(await storage.copy(`test/${crypto.randomUUID()}`, copy)).toBe(false)
  })

  it('deletes objects, ignoring ones that are already gone', async () => {
    const key = `test/${crypto.randomUUID()}`
    await upload(key, PNG)
    await storage.delete([key, `test/${crypto.randomUUID()}`])
    expect(await storage.stat(key)).toBeNull()
    await storage.delete([])
  })

  it('creates the bucket idempotently and lets the web app upload cross-origin', async () => {
    await storage.ensureBucket([TEST_WEB_ORIGIN])
    const { url } = await storage.presignPut(`test/${crypto.randomUUID()}`, {
      contentType: 'image/png',
      size: 1,
      expiresIn: 60,
    })

    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin: TEST_WEB_ORIGIN,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(preflight.headers.get('access-control-allow-origin')).toBe(TEST_WEB_ORIGIN)
  })
})

describe('encryption at rest (RustFS KMS)', () => {
  const config = { ...testStorageConfig(), bucket: 'chinchi-test-sse', encryption: true }
  const encrypted = createObjectStorage(config)
  const raw = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  })

  it('encrypts what browsers upload, without them sending anything extra', async () => {
    await encrypted.ensureBucket([TEST_WEB_ORIGIN])
    // Again, as on every start: the key and the bucket default are already there.
    await encrypted.ensureBucket([TEST_WEB_ORIGIN])
    const key = `test/${crypto.randomUUID()}`
    const { url, headers } = await encrypted.presignPut(key, {
      contentType: 'image/png',
      size: PNG.byteLength,
      expiresIn: 60,
    })

    expect((await fetch(url, { method: 'PUT', headers, body: PNG })).ok).toBe(true)
    const head = await raw.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }))
    expect(head.ServerSideEncryption).toBe('AES256')
    expect(await encrypted.readStart(key, PNG.byteLength)).toEqual(PNG)
  })
})
