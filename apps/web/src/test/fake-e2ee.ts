import { vi } from 'vitest'

import { decodePayload, encodePayload, fromBase64, toBase64 } from '../features/e2ee/codec'

import type {
  CallKey,
  CipherMessage,
  ConversationStatus,
  EncryptedChannel,
} from '../features/e2ee/client'
import type { E2eeClientFactory } from '../features/e2ee/e2ee-context'
import type { ApiClient } from '@chinchi/sdk'

/** What the fake "encrypts" to: the payload in base64, so the fake can read it back. */
export const fakeCiphertext = (text: string) => toBase64(encodePayload({ v: 1, text }))

/** Stands in for the MLS client in UI tests (MLS itself is tested in features/e2ee). */
export const createFakeE2ee = (status: ConversationStatus = 'ready') => {
  let api: ApiClient | null = null
  const client = {
    ready: vi.fn(async () => '700'),
    open: vi.fn(async (_channel: EncryptedChannel) => status),
    send: vi.fn(async (channel: EncryptedChannel, text: string, nonce?: string) => {
      if (!api) throw new Error('The fake e2ee client has no API yet')
      const { message } = await api.messages.create(channel.id, {
        ciphertext: fakeCiphertext(text),
        ...(nonce ? { nonce } : {}),
      })
      return message
    }),
    read: vi.fn(async (_channel: EncryptedChannel, message: CipherMessage) =>
      message.ciphertext ? decodePayload(fromBase64(message.ciphertext)) : null,
    ),
    devicesChanged: vi.fn(async (_userId: string) => undefined),
    callKey: vi.fn(async (_channel: EncryptedChannel): Promise<CallKey | null> =>
      status === 'ready' ? { epoch: 1, key: new Uint8Array(32).fill(1) } : null,
    ),
  }
  const factory: E2eeClientFactory = (_userId, givenApi) => {
    api = givenApi
    return client
  }
  return { client, factory }
}
