import { CornerUpLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MessageReply } from '@chinchi/shared'

import { useMemberNames } from '../guilds/use-member-names'
import { jumpWhenRendered } from './reveal-message'

/** The line above a reply: who it answers and the start of what they said. */
export const ReplyHeader = ({
  reply,
  guildId,
}: {
  reply: MessageReply
  /** The server the reply is on (for nicknames); null in DMs. */
  guildId: string | null
}) => {
  const { t } = useTranslation()
  const nameOf = useMemberNames(guildId)
  const original = reply.message

  if (!original) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted italic">
        <CornerUpLeft aria-hidden className="size-3.5" />
        {t('messages.replyDeleted')}
      </p>
    )
  }

  const name = original.author ? nameOf(original.author) : t('messages.deletedUser')
  // One line, as plain text: the snippet is a hint, the original is one click away.
  const snippet = original.content
    .replace(/<a?:([A-Za-z0-9_]{2,32}):\d+>/g, ':$1:')
    .replace(/\s+/g, ' ')
    .trim()

  return (
    <button
      type="button"
      onClick={() => void jumpWhenRendered(reply.messageId)}
      aria-label={t('messages.replyTo', {
        name,
        snippet: snippet || t('messages.replyAttachments', { count: original.attachmentCount }),
      })}
      className="flex max-w-full items-center gap-1 text-left text-xs text-muted hover:text-text"
    >
      <CornerUpLeft aria-hidden className="size-3.5 shrink-0" />
      <span className="shrink-0 font-semibold">{name}</span>
      <span className="truncate">
        {snippet || t('messages.replyAttachments', { count: original.attachmentCount })}
      </span>
    </button>
  )
}
