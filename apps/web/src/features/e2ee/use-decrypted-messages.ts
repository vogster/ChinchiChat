import { replySnippetText } from '@chinchi/shared'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useE2ee } from './e2ee-context'
import { useDecryptedReactions } from './use-decrypted-reactions'

import type { MessageItem } from '../messages/queries'
import type { EncryptedChannel, ReadMessage } from './client'
import type { PublicUser } from '@chinchi/shared'

const keyOf = (message: MessageItem) => `${message.id}:${message.editedAt ?? ''}`

/**
 * Messages with their text decrypted (and remembered by the client). Ones this device can't
 * read say so instead of showing nothing. A message whose MLS signer is not the author the
 * server named is shown as the signer's, with a warning. Plain conversations pass through.
 */
export const useDecryptedMessages = (
  channel: EncryptedChannel | undefined,
  messages: readonly MessageItem[],
): readonly MessageItem[] => {
  const { t } = useTranslation()
  const { client } = useE2ee()
  const [read, setRead] = useState<ReadonlyMap<string, ReadMessage | null>>(new Map())
  // Asked already (answers may still be on their way): each message is read once.
  const asked = useRef(new Set<string>())
  const reactionsOf = useDecryptedReactions(channel, messages)

  useEffect(() => {
    if (!channel || !client) return
    for (const message of messages) {
      const key = keyOf(message)
      if (!message.ciphertext || message.pending || asked.current.has(key)) continue
      asked.current.add(key)
      void client
        .read(channel, {
          id: message.id,
          ciphertext: message.ciphertext,
          nonce: message.nonce,
          editedAt: message.editedAt,
          authorId: message.author?.id ?? null,
        })
        .catch(() => null)
        .then((result) => {
          setRead((known) => new Map(known).set(key, result))
        })
    }
  }, [channel, client, messages])

  if (!channel) return messages
  /** The server can't quote an encrypted message: the quote comes from what was decrypted here. */
  const quoteOf = (reply: MessageItem['reply']): MessageItem['reply'] => {
    if (!reply?.message) return reply
    const original = messages.find((m) => m.id === reply.messageId)
    const text = original ? read.get(keyOf(original))?.payload.text : undefined
    return {
      ...reply,
      message: { ...reply.message, content: replySnippetText(text ?? t('e2ee.encryptedQuote')) },
    }
  }
  /** The signer as the app knows them: from any message the server did attribute to them. */
  const userById = (userId: string): PublicUser | null =>
    messages.find((m) => m.author?.id === userId)?.author ?? null
  const shown = messages.map((message): MessageItem | null => {
    if (!message.ciphertext || message.pending) return message
    const key = keyOf(message)
    // The server's attachments are ciphertext under a generic name: never shown as they are.
    if (!read.has(key)) return { ...message, content: t('e2ee.decrypting'), attachments: [] }
    const result = read.get(key)
    if (!result) return null
    const { payload, sender } = result
    const encryptedFiles = (payload.files ?? []).flatMap((file) => {
      const attachment = message.attachments.find((a) => a.id === file.id)
      return attachment ? [{ ...file, url: attachment.url }] : []
    })
    return {
      ...message,
      // Whoever signed it is the author, whatever the server said.
      author:
        sender.kind === 'mismatch' ? (userById(sender.userId) ?? message.author) : message.author,
      senderCheck: sender,
      content: payload.text,
      attachments: [],
      encryptedFiles,
      reply: quoteOf(message.reply),
      reactions: reactionsOf(message),
    }
  })
  return foldUnreadable(messages, shown, (count) => t('e2ee.unreadable', { count }))
}

/**
 * Messages this device can't read (sent before it joined) fold into one quiet line per run,
 * instead of a wall of "unavailable".
 */
const foldUnreadable = (
  messages: readonly MessageItem[],
  shown: readonly (MessageItem | null)[],
  notice: (count: number) => string,
): MessageItem[] => {
  const out: MessageItem[] = []
  let run: MessageItem[] = []
  const close = () => {
    const first = run[0]
    if (first) out.push({ ...first, content: '', attachments: [], notice: notice(run.length) })
    run = []
  }
  shown.forEach((item, index) => {
    if (item) {
      close()
      out.push(item)
    } else {
      run.push(messages[index] as MessageItem)
    }
  })
  close()
  return out
}
