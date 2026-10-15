import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import { CodedError } from '../../lib/errors'
import { useCurrentUser } from '../auth/use-auth-actions'
import { dmKeys } from '../dms/queries'
import { useE2ee } from '../e2ee/e2ee-context'

import type { CallKey, EncryptedChannel } from '../e2ee/client'
import type { PrivateChannel, Snowflake } from '@chinchi/shared'

/**
 * Keys for calls in encrypted conversations: the MLS exporter secret of the current epoch, so
 * a device that leaves the conversation can't follow the call after the next commit.
 */
export const useCallEncryption = () => {
  const { client, revision } = useE2ee()
  const queryClient = useQueryClient()
  const myId = useCurrentUser()?.id

  /** The encrypted conversation behind a DM call; null for server channels and plain DMs. */
  const conversationOf = useCallback(
    (guildId: Snowflake | null, channelId: Snowflake): EncryptedChannel | null => {
      if (guildId !== null || !myId) return null
      const channel = queryClient
        .getQueryData<PrivateChannel[]>(dmKeys.all)
        ?.find((dm) => dm.id === channelId)
      if (!channel?.encrypted) return null
      return { id: channel.id, memberIds: [myId, ...channel.recipients.map((r) => r.id)] }
    },
    [queryClient, myId],
  )

  /** The key to start the call with; fails while this device is not in the conversation. */
  const keyFor = useCallback(
    async (conversation: EncryptedChannel): Promise<CallKey> => {
      if (!client || (await client.open(conversation)) !== 'ready') {
        throw new CodedError('E2EE_CALL_NOT_READY')
      }
      const key = await client.callKey(conversation)
      if (!key) throw new CodedError('E2EE_CALL_NOT_READY')
      return key
    },
    [client],
  )

  return { client, revision, conversationOf, keyFor }
}

/** While an encrypted call is on, every handshake may bring a new epoch: hand its key over. */
export const useCallKeyRotation = (
  conversation: EncryptedChannel | null,
  apply: (key: CallKey) => Promise<void>,
) => {
  const { client, revision } = useE2ee()
  const applied = useRef<number | null>(null)

  useEffect(() => {
    if (!conversation) {
      applied.current = null
      return
    }
    if (!client) return
    let current = true
    client
      .callKey(conversation)
      .then(async (key) => {
        if (!current || !key || (applied.current !== null && key.epoch <= applied.current)) return
        applied.current = key.epoch
        await apply(key)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [client, revision, conversation, apply])

  /** The call started with this epoch's key: only a later one needs handing over. */
  return useCallback((epoch: number | null) => {
    applied.current = epoch
  }, [])
}
