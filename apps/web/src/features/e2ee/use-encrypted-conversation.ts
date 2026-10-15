import { useEffect, useMemo, useState } from 'react'

import { useE2ee } from './e2ee-context'

import type { ConversationStatus, EncryptedChannel } from './client'
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
    send: (text: string, nonce: string) => {
      if (!channel || !client) throw new Error('Not an encrypted conversation')
      return client.send(channel, text, nonce)
    },
  }
}
