import { useCallback, useEffect, useRef, useState } from 'react'

import { useCurrentUser } from '../auth/use-auth-actions'
import { useE2ee } from './e2ee-context'

import type { MessageItem } from '../messages/queries'
import type { EncryptedChannel } from './client'
import type { EncryptedReaction, Reaction } from '@chinchi/shared'

const keyOf = (reaction: EncryptedReaction) => `${reaction.userId}:${reaction.version}`

/**
 * Reactions of an encrypted conversation: each person's set, decrypted once, added up into the
 * counts the reactions bar shows (in order of first use, mine marked).
 */
export const useDecryptedReactions = (
  channel: EncryptedChannel | undefined,
  messages: readonly MessageItem[],
) => {
  const { client } = useE2ee()
  const myId = useCurrentUser()?.id
  const [sets, setSets] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const asked = useRef(new Set<string>())

  useEffect(() => {
    if (!channel || !client) return
    for (const message of messages) {
      for (const reaction of message.encryptedReactions ?? []) {
        const key = keyOf(reaction)
        if (asked.current.has(key)) continue
        asked.current.add(key)
        void client
          .readReaction(channel, message.id, reaction)
          .catch(() => [])
          .then((set) => setSets((known) => new Map(known).set(key, set)))
      }
    }
  }, [channel, client, messages])

  return useCallback(
    (message: MessageItem): Reaction[] => {
      const counts = new Map<string, { count: number; me: boolean }>()
      for (const reaction of message.encryptedReactions ?? []) {
        for (const emoji of sets.get(keyOf(reaction)) ?? []) {
          const known = counts.get(emoji) ?? { count: 0, me: false }
          counts.set(emoji, {
            count: known.count + 1,
            me: known.me || reaction.userId === myId,
          })
        }
      }
      return [...counts].map(([emoji, { count, me }]) => ({ emoji, count, me }))
    },
    [sets, myId],
  )
}
