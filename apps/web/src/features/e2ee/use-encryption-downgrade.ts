import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useE2ee } from './e2ee-context'

import type { PrivateChannel } from '@chinchi/shared'

/**
 * True when the server calls this conversation unencrypted although this device saw it
 * encrypted: then nothing may be sent in it (it would go out in plaintext). While it is
 * encrypted, this device remembers that.
 */
export const useEncryptionDowngrade = (channel: PrivateChannel): boolean => {
  const { client } = useE2ee()

  useEffect(() => {
    if (client && channel.encrypted) void client.conversations.remember(channel.id)
  }, [client, channel.id, channel.encrypted])

  const { data } = useQuery({
    queryKey: ['e2ee', 'was-encrypted', channel.id],
    queryFn: () => client?.conversations.wasEncrypted(channel.id) ?? false,
    enabled: client !== null && !channel.encrypted,
  })
  return !channel.encrypted && data === true
}
