import { decodeSnowflake } from '@chinchi/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { HeaderPopover } from '../../components/ui/header-popover'
import { useApi } from '../../lib/api-context'
import { threadsOf } from '../guilds/channel-tree'
import { formatMessageTime } from '../messages/format-time'
import { isUnread, useReadStates } from '../messages/use-messages'

import type { Channel, GuildDetail, ThreadPreview } from '@chinchi/shared'

/** "Аня: текст" under a thread's name, with a small avatar, as one line. */
const LastMessage = ({ preview }: { preview: ThreadPreview }) => {
  const { t } = useTranslation()
  const name = preview.authorName ?? t('messages.deletedUser')
  const text =
    preview.content.replace(/<a?:([A-Za-z0-9_]{2,32}):\d+>/g, ':$1:') ||
    t('messages.replyAttachments', { count: preview.attachmentCount })
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
      <Avatar
        name={name}
        src={preview.author?.avatarUrl ?? null}
        id={preview.author?.id}
        className="size-4 shrink-0"
      />
      <span className="min-w-0 truncate">
        <span className="font-medium text-text">{name}:</span> {text}
      </span>
    </span>
  )
}

/** The newest message of each thread; asked again whenever a thread gets a new one. */
const useThreadPreviews = (channelId: string, lastIds: string) => {
  const api = useApi()
  return useQuery({
    queryKey: ['threadPreviews', channelId, lastIds],
    queryFn: async () => (await api.channels.threadPreviews(channelId)).previews,
    enabled: lastIds !== '',
    placeholderData: (previous) => previous,
  })
}

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
  const lastIds = threads
    .map((thread) => thread.lastMessageId)
    .filter(Boolean)
    .join(',')
  const { data: previews } = useThreadPreviews(channel.id, lastIds)

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
            const preview = previews?.find((p) => p.threadId === thread.id)
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
                  {preview ? <LastMessage preview={preview} /> : null}
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
