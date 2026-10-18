import { decodeSnowflake } from '@chinchi/shared'
import { Link } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatShortTime } from './format-time'

import type { Channel } from '@chinchi/shared'

/** Under the message a thread started from: its name, size and when it last moved. */
export const ThreadCard = ({ thread }: { thread: Channel }) => {
  const { t, i18n } = useTranslation()
  const count = t('threads.count', { count: thread.messageCount })
  const lastAt = thread.lastMessageId
    ? new Date(decodeSnowflake(thread.lastMessageId).timestamp).toISOString()
    : null
  return (
    <Link
      to="/channels/$guildId/$channelId"
      // Opens beside the channel it was started in.
      params={{ guildId: thread.guildId, channelId: thread.parentId ?? thread.id }}
      search={{ thread: thread.id }}
      aria-label={t('threads.chip', { name: thread.name, count: thread.messageCount })}
      className="ml-1 flex max-w-full items-center gap-2.5 rounded-[18px] bg-stage py-[7px] pr-3.5 pl-[7px] text-left transition-colors hover:bg-field"
    >
      <span
        aria-hidden
        className="grid size-[30px] shrink-0 place-items-center rounded-[11px] bg-accent-soft text-accent-text"
      >
        <MessagesSquare className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-semibold text-accent-text">{thread.name}</span>
        <span className="text-xs whitespace-nowrap text-faint">
          {lastAt
            ? t('threads.meta', { size: count, time: formatShortTime(lastAt, i18n.language) })
            : count}
        </span>
      </span>
    </Link>
  )
}
