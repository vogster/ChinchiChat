import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useE2ee } from './e2ee-context'

import type { EncryptedChannel } from './client'
import type { MessageItem } from '../messages/queries'

const keyOf = (message: MessageItem) => `${message.id}:${message.editedAt ?? ''}`

/**
 * Messages with their text decrypted (and remembered by the client). Ones this device can't
 * read say so instead of showing nothing. Plain conversations pass through untouched.
 */
export const useDecryptedMessages = (
  channel: EncryptedChannel | undefined,
  messages: readonly MessageItem[],
): readonly MessageItem[] => {
  const { t } = useTranslation()
  const { client } = useE2ee()
  const [texts, setTexts] = useState<ReadonlyMap<string, string | null>>(new Map())
  // Asked already (answers may still be on their way): each message is read once.
  const asked = useRef(new Set<string>())

  useEffect(() => {
    if (!channel || !client) return
    for (const message of messages) {
      const key = keyOf(message)
      if (!message.ciphertext || message.pending || asked.current.has(key)) continue
      asked.current.add(key)
      void client
        .read(channel, { id: message.id, ciphertext: message.ciphertext, nonce: message.nonce })
        .catch(() => null)
        .then((payload) => {
          setTexts((known) => new Map(known).set(key, payload?.text ?? null))
        })
    }
  }, [channel, client, messages])

  if (!channel) return messages
  return messages.map((message) => {
    if (!message.ciphertext || message.pending) return message
    const key = keyOf(message)
    if (!texts.has(key)) return { ...message, content: t('e2ee.decrypting') }
    const text = texts.get(key)
    return { ...message, content: text ?? t('e2ee.undecryptable') }
  })
}
