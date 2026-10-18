import { decodeSnowflake } from '@chinchi/shared'
import { Link } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HeaderPopover } from '../../components/ui/header-popover'
import { threadsOf } from '../guilds/channel-tree'
import { formatMessageTime } from '../messages/format-time'
import { isUnread, useReadStates } from '../messages/use-messages'

import type { Channel, GuildDetail } from '@chinchi/shared'

/** The channel's threads, dropped from the header; one click opens a thread beside the chat. */
export const ThreadsPopover = ({
  guild,
  channel,
  onClose,
}: {
  guild: GuildDetail
  channel: Channel
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const readStates = useReadStates()
  const threads = threadsOf(guild.channels, channel.id)

  return (
    <HeaderPopover
      label={t('threads.listLabel', { name: channel.name })}
      title={t('threads.list')}
      subtitle={`#${channel.name} · ${threads.length}`}
      icon={<MessagesSquare className="size-[18px]" />}
      onClose={onClose}
    >
      {threads.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-faint">{t('threads.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {threads.map((thread) => {
            const unread =
              readStates !== undefined && isUnread(thread.lastMessageId, readStates[thread.id])
            return (
              <li key={thread.id}>
                <Link
                  to="/channels/$guildId/$channelId"
                  params={{ guildId: guild.id, channelId: channel.id }}
                  search={{ thread: thread.id }}
                  aria-label={t('threads.chip', { name: thread.name, count: thread.messageCount })}
                  className="flex flex-col gap-1 rounded-[20px] bg-stage px-3.5 py-3 transition-colors hover:bg-field"
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{thread.name}</span>
                    {unread ? (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-contrast">
                        {t('threads.new')}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-faint">
                    {thread.lastMessageId
                      ? t('threads.metaLong', {
                          size: t('threads.count', { count: thread.messageCount }),
                          time: formatMessageTime(
                            new Date(decodeSnowflake(thread.lastMessageId).timestamp).toISOString(),
                            i18n.language,
                          ),
                        })
                      : t('threads.count', { count: thread.messageCount })}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </HeaderPopover>
  )
}
