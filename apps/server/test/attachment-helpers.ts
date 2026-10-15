import type { TestActor } from './guild-helpers'
import type { FastifyInstance } from 'fastify'

export interface TestUpload {
  readonly id: string
  readonly uploadUrl: string
  readonly headers: Record<string, string>
}

/** Requests an upload slot and puts the bytes into storage, as a client would. */
export const uploadFile = async (
  app: FastifyInstance,
  actor: TestActor,
  channelId: string,
  bytes: Uint8Array,
  { filename = 'cat.png', contentType = 'image/png' } = {},
): Promise<TestUpload> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${channelId}/attachments`,
    headers: actor.headers,
    payload: { filename, size: bytes.byteLength, contentType },
  })
  if (response.statusCode !== 201) throw new Error(`Upload slot failed: ${response.body}`)
  const slot = response.json().data.attachment as TestUpload
  const put = await fetch(slot.uploadUrl, { method: 'PUT', headers: slot.headers, body: bytes })
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`)
  return slot
}

/** Sends a message with the given uploads and returns it. */
export const sendFiles = async (
  app: FastifyInstance,
  actor: TestActor,
  channelId: string,
  attachmentIds: string[],
) => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/channels/${channelId}/messages`,
    headers: actor.headers,
    payload: { attachmentIds },
  })
  if (response.statusCode !== 201) throw new Error(`Send failed: ${response.body}`)
  return response.json().data.message as {
    id: string
    attachments: { id: string; url: string; previewUrl: string | null }[]
  }
}
