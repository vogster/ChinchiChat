import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { useApi } from '../../lib/api-context'
import { dmsQueryOptions } from '../dms/queries'

import type { EncryptedChannel } from './client'
import type { E2eeClientLike } from './e2ee-factory'
import type { PrivateChannel } from '@chinchi/shared'

/**
 * The encrypted conversations a device change concerns: those of the person whose devices
 * changed (all of mine when they are my own, or when `changed` is null).
 */
export const encryptedConversationsOf = (
  channels: readonly PrivateChannel[],
  myId: string,
  changed: string | null,
): EncryptedChannel[] =>
  channels
    .filter((channel) => channel.encrypted)
    .filter(
      (channel) =>
        changed === null ||
        changed === myId ||
        channel.recipients.some((recipient) => recipient.id === changed),
    )
    .map((channel) => ({
      id: channel.id,
      memberIds: [myId, ...channel.recipients.map((recipient) => recipient.id)],
      group: channel.type === 'group_dm',
    }))

/**
 * Lets approved devices into every encrypted conversation this device is in, not only the open
 * one: a new device can't join by itself, someone already inside has to add it. One
 * conversation at a time, and one pass at a time, so a burst of changes makes no commit storm.
 */
export const useBackgroundAdmission = (client: E2eeClientLike | null, myId: string | undefined) => {
  const api = useApi()
  const queryClient = useQueryClient()
  const queue = useRef<Promise<void>>(Promise.resolve())

  return useCallback(
    (changed: string | null) => {
      if (!client || !myId) return
      queue.current = queue.current.then(async () => {
        const channels = await queryClient.ensureQueryData(dmsQueryOptions(api)).catch(() => [])
        for (const channel of encryptedConversationsOf(channels, myId, changed)) {
          await client.admit(channel).catch(() => undefined)
        }
      })
    },
    [client, myId, api, queryClient],
  )
}
