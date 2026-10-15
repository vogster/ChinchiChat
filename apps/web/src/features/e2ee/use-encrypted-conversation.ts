import { useEffect, useMemo, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { useE2ee } from './e2ee-context'
import { encryptFile } from './file-crypto'

import type { ConversationStatus, EncryptedChannel } from './client'
import type { EncryptedFile } from './codec'
import type { PrivateChannel } from '@chinchi/shared'

export type EncryptedState = ConversationStatus | 'opening' | 'failed'

/** The members of an encrypted DM as the MLS client sees them; undefined for plain DMs. */
export const useEncryptedChannel = (
  channel: PrivateChannel,
  myId: string | undefined,
): EncryptedChannel | undefined => {
  const ids = channel.recipients.map((r) => r.id).join(',')
  return useMemo(
    () =>
      channel.encrypted && myId
        ? { id: channel.id, memberIds: [myId, ...ids.split(',').filter(Boolean)] }
        : undefined,
    [channel.encrypted, channel.id, myId, ids],
  )
}

/**
 * Opens an encrypted conversation on this device (joining or starting its group, adding the
 * members' new devices) and again whenever a handshake or device change comes in.
 */
export const useEncryptedConversation = (channel: EncryptedChannel | undefined) => {
  const { client, revision } = useE2ee()
  const api = useApi()
  const [state, setState] = useState<EncryptedState>('opening')

  useEffect(() => {
    if (!channel || !client) return
    let current = true
    client
      .open(channel)
      .then((status) => current && setState(status))
      .catch(() => current && setState('failed'))
    return () => {
      current = false
    }
  }, [channel, client, revision])

  return {
    state,
    /** Files go up encrypted under a generic name; what opens them rides in the message. */
    send: async (text: string, nonce: string, files: readonly File[] = []) => {
      if (!channel || !client) throw new Error('Not an encrypted conversation')
      const sealed: EncryptedFile[] = []
      for (const file of files) {
        const { blob, file: secret } = await encryptFile(file)
        const id = await api.attachments.upload(channel.id, blob, {
          filename: 'encrypted',
          contentType: 'application/octet-stream',
        })
        sealed.push({ id, ...secret })
      }
      return client.send(channel, text, nonce, sealed)
    },
  }
}
