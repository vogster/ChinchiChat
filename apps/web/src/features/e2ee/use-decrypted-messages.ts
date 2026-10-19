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
  const { client, revision } = useE2ee()
  const [read, setRead] = useState<ReadonlyMap<string, ReadMessage | null>>(new Map())
  // Asked already (answers may still be on their way): each message is read once.
  const asked = useRef(new Set<string>())
  // Read as unreadable: asked again when the keys change (the device was approved meanwhile).
  const unreadable = useRef(new Set<string>())
  const seenRevision = useRef(revision)
  const reactionsOf = useDecryptedReactions(channel, messages)

  useEffect(() => {
    if (!channel || !client) return
    if (seenRevision.current !== revision) {
      seenRevision.current = revision
      for (const key of unreadable.current) asked.current.delete(key)
      unreadable.current.clear()
    }
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
          if (!result) unreadable.current.add(key)
          setRead((known) => new Map(known).set(key, result))
        })
    }
  }, [channel, client, messages, revision])

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
  const shown = messages.map((message): Shown => {
    if (!message.ciphertext || message.pending) return message
    const key = keyOf(message)
    if (!read.has(key)) return 'decrypting'
    const result = read.get(key)
    if (!result) return 'unreadable'
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
  return foldRuns(messages, shown, (state, count) =>
    state === 'decrypting' ? t('e2ee.decrypting') : t('e2ee.unreadable', { count }),
  )
}

/** A message as shown, or why it can't be yet ('decrypting') or at all ('unreadable'). */
type Shown = MessageItem | 'decrypting' | 'unreadable'

/**
 * Messages this device can't read (sent before it joined) fold into one quiet line per run,
 * instead of a wall of "unavailable"; so do ones still decrypting. A run keeps its first
 * message's id, so a "decrypting" line that turns out unreadable stays the same row and the
 * feed doesn't jump through a bubble per message on the way.
 */
const foldRuns = (
  messages: readonly MessageItem[],
  shown: readonly Shown[],
  notice: (state: 'decrypting' | 'unreadable', count: number) => string,
): MessageItem[] => {
  const out: MessageItem[] = []
  let run: { state: 'decrypting' | 'unreadable'; items: MessageItem[] } | null = null
  const close = () => {
    const first = run?.items[0]
    if (run && first) {
      // The server's attachments are ciphertext under a generic name: never shown as they are.
      out.push({
        ...first,
        content: '',
        attachments: [],
        notice: notice(run.state, run.items.length),
      })
    }
    run = null
  }
  shown.forEach((item, index) => {
    if (typeof item !== 'string') {
      close()
      out.push(item)
      return
    }
    if (run?.state !== item) {
      close()
      run = { state: item, items: [] }
    }
    run.items.push(messages[index] as MessageItem)
  })
  close()
  return out
}
