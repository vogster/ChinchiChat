import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { contentDisposition } from './content-disposition'
import { ensureKmsKey } from './storage-kms'

import type { StorageConfig } from '../config/env'

export interface PresignPutOptions {
  readonly contentType: string
  /** Exact byte size: signed, so storage rejects a body of any other size. */
  readonly size: number
  readonly expiresIn: number
}

export interface PresignGetOptions {
  readonly filename: string
  readonly contentType: string
  /** Inline only for content that is safe to render; everything else downloads. */
  readonly inline: boolean
  readonly expiresIn: number
  /** Fixing the signing time makes the URL identical within a window, so browsers cache it. */
  readonly signedAt?: Date
}

export interface ListedObject {
  readonly key: string
  readonly lastModified: Date
}

export interface ObjectStat {
  readonly size: number
  readonly contentType: string | undefined
}

const isNotFound = (error: unknown): boolean => {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404
}

const createClient = (config: StorageConfig, endpoint: string) =>
  new S3Client({
    endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // A stalled storage must not hang requests or the preview worker (and with it, shutdown).
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
    // Default checksums would add headers to presigned URLs that browsers do not send.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

/** S3-compatible object storage (RustFS in the bundled deployment). */
export const createObjectStorage = (config: StorageConfig) => {
  const client = createClient(config, config.endpoint)
  // Presigned URLs are opened by browsers, which may reach storage under another address.
  const publicClient =
    config.publicUrl === config.endpoint ? client : createClient(config, config.publicUrl)
  const Bucket = config.bucket

  return {
    /**
     * Creates the bucket if needed and allows browser uploads from the web app's origins; with
     * encryption on, every object (presigned uploads included) is encrypted by the storage.
     */
    async ensureBucket(corsOrigins: readonly string[]): Promise<void> {
      try {
        await client.send(new HeadBucketCommand({ Bucket }))
      } catch (error) {
        if (!isNotFound(error)) throw error
        await client.send(new CreateBucketCommand({ Bucket }))
      }
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [...corsOrigins],
                AllowedMethods: ['PUT', 'GET', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      )
      if (!config.encryption) return
      await ensureKmsKey(config)
      await client.send(
        new PutBucketEncryptionCommand({
          Bucket,
          ServerSideEncryptionConfiguration: {
            Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
          },
        }),
      )
    },

    async presignPut(
      key: string,
      { contentType, size, expiresIn }: PresignPutOptions,
    ): Promise<{ url: string; headers: Record<string, string> }> {
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
      })
      const url = await getSignedUrl(publicClient, command, {
        expiresIn,
        signableHeaders: new Set(['content-type', 'content-length']),
      })
      // Content-Length is set by the HTTP client from the body.
      return { url, headers: { 'Content-Type': contentType } }
    },

    presignGet(
      key: string,
      { filename, contentType, inline, expiresIn, signedAt }: PresignGetOptions,
    ): Promise<string> {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(filename, inline),
      })
      return getSignedUrl(publicClient, command, {
        expiresIn,
        ...(signedAt ? { signingDate: signedAt } : {}),
      })
    },

    /** Server-side copy; false when the source does not exist. */
    async copy(from: string, to: string): Promise<boolean> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket,
            Key: to,
            CopySource: `${Bucket}/${from.split('/').map(encodeURIComponent).join('/')}`,
          }),
        )
        return true
      } catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    },

    async stat(key: string): Promise<ObjectStat | null> {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return { size: head.ContentLength ?? 0, contentType: head.ContentType }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    /** The whole object; callers bound the size first (see `stat`). */
    async read(key: string): Promise<Uint8Array> {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }))
      return object.Body ? object.Body.transformToByteArray() : new Uint8Array()
    },

    async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }),
      )
    },

    /** The first `bytes` bytes (fewer if the object is smaller). */
    async readStart(key: string, bytes: number): Promise<Uint8Array> {
      const object = await client.send(
        new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
      )
      return object.Body ? object.Body.transformToByteArray() : new Uint8Array()
    },

    /** Keys under `prefix` in key order, after `after` (a resumable cursor). */
    async list(
      prefix: string,
      { after, limit = 1000 }: { after?: string | undefined; limit?: number } = {},
    ): Promise<{ objects: ListedObject[]; more: boolean }> {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket,
          Prefix: prefix,
          MaxKeys: limit,
          ...(after ? { StartAfter: after } : {}),
        }),
      )
      return {
        objects: (page.Contents ?? []).flatMap((object) =>
          object.Key ? [{ key: object.Key, lastModified: object.LastModified ?? new Date(0) }] : [],
        ),
        more: page.IsTruncated === true,
      }
    },

    async delete(keys: readonly string[]): Promise<void> {
      await Promise.all(keys.map((Key) => client.send(new DeleteObjectCommand({ Bucket, Key }))))
    },
  }
}

export type ObjectStorage = ReturnType<typeof createObjectStorage>
