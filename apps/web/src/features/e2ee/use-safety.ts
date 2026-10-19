import { useCallback, useEffect, useState } from 'react'

import { useE2ee } from './e2ee-context'

import type { EncryptedChannel } from './client'
import type { SafetyStatus } from './safety'

/**
 * Who has new devices and who was checked, kept current as devices come and go. Loaded once the
 * conversation is ready here, or as soon as someone asks (`refresh`, the safety window): the
 * codes come from the people's public keys, so a device still waiting to be let in has them too.
 */
export const useSafety = (channel: EncryptedChannel | undefined, ready: boolean) => {
  const { client, revision } = useE2ee()
  const [status, setStatus] = useState<SafetyStatus | null>(null)
  const [asked, setAsked] = useState(0)

  useEffect(() => {
    if (!channel || !client || (!ready && asked === 0)) return
    let current = true
    client.safety
      .status(channel.memberIds)
      .then((next) => current && setStatus(next))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [channel, client, ready, revision, asked])

  const refresh = useCallback(() => setAsked((value) => value + 1), [])

  const codeWith = useCallback(
    (userId: string) => client?.safety.codeWith(userId) ?? Promise.resolve(null),
    [client],
  )
  const verify = useCallback(
    async (userId: string) => {
      await client?.safety.verify(userId)
      refresh()
    },
    [client, refresh],
  )
  const acknowledge = useCallback(
    async (userIds: readonly string[]) => {
      for (const userId of userIds) await client?.safety.acknowledge(userId)
      refresh()
    },
    [client, refresh],
  )

  return { status, refresh, codeWith, verify, acknowledge }
}

export type SafetyControls = ReturnType<typeof useSafety>
