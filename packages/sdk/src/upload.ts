import { ApiError } from './errors'

import type { FetchLike } from './http'
import type { AttachmentUpload } from '@chinchi/shared'

/** Bytes sent so far of the file's total, as the upload goes. */
export type UploadProgress = (sent: number, total: number) => void

/** Puts a file to object storage through a presigned slot. */
export type PutFile = (
  slot: AttachmentUpload,
  file: Blob,
  onProgress?: UploadProgress,
) => Promise<void>

const uploadFailed = (status: number) => new ApiError(status, 'UPLOAD_FAILED', 'File upload failed')
const networkError = () => new ApiError(0, 'NETWORK_ERROR', 'Network request failed')

/**
 * Through `fetch`, which has no upload progress: the file counts as sent once it is. For native
 * clients whose fetch leaves through their own stack.
 */
export const createFetchPut =
  (fetch: FetchLike): PutFile =>
  async (slot, file, onProgress) => {
    await putToStorage(fetch, slot, file)
    onProgress?.(file.size, file.size)
  }

/** Through XMLHttpRequest, which reports how far the upload is (browsers). */
export const createXhrPut =
  (Xhr: typeof XMLHttpRequest): PutFile =>
  (slot, file, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new Xhr()
      xhr.open(slot.method, slot.uploadUrl)
      // No cookies or tokens: the signature in the URL is the only credential storage needs.
      xhr.withCredentials = false
      for (const [name, value] of Object.entries(slot.headers)) xhr.setRequestHeader(name, value)
      xhr.upload.onprogress = (event) => {
        onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size)
      }
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(uploadFailed(xhr.status))
      xhr.onerror = () => reject(networkError())
      xhr.send(file)
    })

/** Puts the file straight to object storage through the presigned slot. */
export const putToStorage = async (
  fetch: FetchLike,
  slot: AttachmentUpload,
  file: Blob,
): Promise<void> => {
  let response: Response
  try {
    // No cookies or tokens: the signature in the URL is the only credential storage needs.
    response = await fetch(slot.uploadUrl, {
      method: slot.method,
      headers: slot.headers,
      body: file,
      credentials: 'omit',
    })
  } catch {
    throw networkError()
  }
  if (!response.ok) throw uploadFailed(response.status)
}

export interface UploadOptions {
  /** Defaults to the file's own name. */
  readonly filename?: string
  /** Defaults to the file's type; the server falls back to a generic binary. */
  readonly contentType?: string
  /** Told how far the upload to storage is. */
  readonly onProgress?: UploadProgress
}

/** The request body describing `file` to the server. */
export const describeFile = (file: Blob, { filename, contentType }: UploadOptions = {}) => {
  const type = contentType ?? file.type
  return {
    filename: filename ?? (file instanceof File ? file.name : 'file'),
    size: file.size,
    ...(type ? { contentType: type } : {}),
  }
}
