import { Forward } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MessageContent } from '../markdown/message-content'
import { formatMessageTime } from './format-time'

import type { ForwardedMessage } from '@chinchi/shared'

/** The original of a forwarded message, as it was when forwarded. */
export const ForwardedBlock = ({ forward }: { forward: ForwardedMessage }) => {
  const { t, i18n } = useTranslation()
  const author = forward.author
    ? (forward.author.displayName ?? forward.author.username)
    : t('messages.deletedUser')
  return (
    <div
      role="group"
      aria-label={t('forward.block')}
      className="mt-1 max-w-xl border-l-4 border-line pl-3"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Forward aria-hidden className="size-3.5" />
        <span className="italic">{t('forward.label')}</span>
        <span className="font-semibold text-text">{author}</span>
        <time dateTime={forward.createdAt}>
          {formatMessageTime(forward.createdAt, i18n.language)}
        </time>
      </div>
      {forward.content ? (
        <MessageContent content={forward.content} className="whitespace-pre-wrap" />
      ) : null}
    </div>
  )
}
