import { createHash, createHmac } from 'node:crypto'

import { SignatureV4 } from '@smithy/signature-v4'

import type { StorageConfig } from '../config/env'

/** RustFS encrypts SSE-S3 objects with this KMS key when none is configured. */
export const DEFAULT_KMS_KEY = 'default'

type SourceData = string | ArrayBuffer | ArrayBufferView

const bytes = (data: SourceData): string | Uint8Array =>
  typeof data === 'string'
    ? data
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)

/** SHA-256 for the request signer, from node:crypto. */
class Sha256 {
  private readonly hash
  constructor(secret?: SourceData) {
    this.hash = secret ? createHmac('sha256', bytes(secret)) : createHash('sha256')
  }
  update(data: SourceData) {
    this.hash.update(bytes(data))
  }
  async digest(): Promise<Uint8Array> {
    return new Uint8Array(this.hash.digest())
  }
}

/**
 * Makes sure the storage's KMS has the default key SSE-S3 needs. RustFS has no way to create it
 * from its configuration, only through its admin API (MinIO-compatible); other S3 services
 * (AWS, ...) answer 404 here and manage their keys themselves.
 */
export const ensureKmsKey = async (
  config: StorageConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<'created' | 'exists' | 'unsupported'> => {
  const url = new URL('rustfs/admin/v3/kms/key/create', `${config.endpoint}/`)
  const signer = new SignatureV4({
    service: 's3',
    region: config.region,
    sha256: Sha256,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  })
  const signed = await signer.sign({
    method: 'POST',
    protocol: url.protocol,
    hostname: url.hostname,
    ...(url.port ? { port: Number(url.port) } : {}),
    path: url.pathname,
    query: { 'key-id': DEFAULT_KMS_KEY },
    headers: { host: url.host },
  })
  url.searchParams.set('key-id', DEFAULT_KMS_KEY)
  const response = await fetchImpl(url, { method: 'POST', headers: signed.headers })
  if (response.ok) return 'created'
  const body = await response.text()
  if (response.status === 409 || body.includes('AlreadyExists')) return 'exists'
  if (response.status === 404 || response.status === 405) return 'unsupported'
  throw new Error(`Storage KMS refused to create the default key (HTTP ${response.status})`)
}
