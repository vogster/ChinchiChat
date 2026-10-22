import { useEffect, useMemo, useState } from 'react'

import { useApi } from '../../lib/api-context'
import { overallProgress } from '../messages/upload-progress'
import { withoutMetadata } from './clean-photo'
import { useE2ee } from './e2ee-context'
import { encryptFile } from './file-crypto'

import type { ConversationStatus, EncryptedChannel, SendOptions } from './client'
import type { EncryptedFile } from './codec'
import type { UploadProgress } from '@chinchi/sdk'
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
        ? {
            id: channel.id,
            memberIds: [myId, ...ids.split(',').filter(Boolean)],
            group: channel.type === 'group_dm',
          }
        : undefined,
    [channel.encrypted, channel.id, channel.type, myId, ids],
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
    send: async (
      text: string,
      {
        nonce,
        files = [],
        reply,
        onProgress,
      }: {
        nonce: string
        files?: readonly File[]
        reply?: SendOptions['reply']
        onProgress?: UploadProgress
      },
    ) => {
      if (!channel || !client) throw new Error('Not an encrypted conversation')
      const progress = overallProgress(files, onProgress ?? (() => undefined))
      const sealed: EncryptedFile[] = []
      for (const [index, file] of files.entries()) {
        // Photos lose their location and camera details first: the server can't strip them later.
        const { blob, file: secret } = await encryptFile(await withoutMetadata(file))
        const id = await api.attachments.upload(channel.id, blob, {
          filename: 'encrypted',
          contentType: 'application/octet-stream',
          onProgress: progress(index),
        })
        sealed.push({ id, ...secret })
      }
      return client.send(channel, text, { nonce, files: sealed, reply })
    },
    /** My whole set of reactions to a message, sent encrypted. */
    react: (messageId: string, emojis: readonly string[]) => {
      if (!channel || !client) throw new Error('Not an encrypted conversation')
      return client.react(channel, messageId, emojis)
    },
    edit: (messageId: string, text: string) => {
      if (!channel || !client) throw new Error('Not an encrypted conversation')
      return client.edit(channel, messageId, text)
    },
  }
}
