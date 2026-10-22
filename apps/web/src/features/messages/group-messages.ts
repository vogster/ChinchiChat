import { localDay } from './format-time'

import type { MessageItem } from './queries'

/** Messages closer than this from the same author share one header. */
const GROUP_WINDOW_MS = 7 * 60 * 1000

export type MessageRow =
  | { readonly kind: 'day'; readonly day: string }
  | { readonly kind: 'message'; readonly message: MessageItem; readonly compact: boolean }

/** Adds day separators and marks follow-up messages that continue the author's run. */
export const groupMessages = (messages: readonly MessageItem[]): MessageRow[] =>
  messages.flatMap((message, index): MessageRow[] => {
    const previous = messages[index - 1]
    const day = localDay(message.createdAt)
    const newDay = !previous || localDay(previous.createdAt) !== day
    // A reply (or a command's answer) always gets a header: it shows what it answers. So does
    // an encrypted message whose signer the server misnamed, or one that came without
    // encryption: the header carries the warning.
    const compact =
      !newDay &&
      message.reply === null &&
      message.interaction === null &&
      message.senderCheck?.kind !== 'mismatch' &&
      message.senderCheck?.kind !== 'plain' &&
      message.system === null &&
      previous?.system === null &&
      previous !== undefined &&
      message.author !== null &&
      previous.author?.id === message.author.id &&
      new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
        GROUP_WINDOW_MS

    const row: MessageRow = { kind: 'message', message, compact }
    return newDay ? [{ kind: 'day', day }, row] : [row]
  })
