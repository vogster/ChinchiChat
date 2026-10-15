import { ApiError } from './errors'

import type { FetchLike } from './http'
import type { AttachmentUpload } from '@chinchi/shared'

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
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed')
  }
  if (!response.ok) throw new ApiError(response.status, 'UPLOAD_FAILED', 'File upload failed')
}

export interface UploadOptions {
  /** Defaults to the file's own name. */
  readonly filename?: string
  /** Defaults to the file's type; the server falls back to a generic binary. */
  readonly contentType?: string
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
