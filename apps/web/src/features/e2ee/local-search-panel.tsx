import { decodeSnowflake } from '@chinchi/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useApi } from '../../lib/api-context'
import { formatMessageTime } from '../messages/format-time'
import { revealMessage } from '../messages/reveal-message'
import { useE2ee } from './e2ee-context'

import type { EncryptedChannel } from './client'

/**
 * Search results for an encrypted conversation, found on this device among what it decrypted
 * (the server can't search it). A result brings its message into view.
 */
export const LocalSearchPanel = ({
  channel,
  query,
  nameOf,
  onClose,
}: {
  channel: EncryptedChannel
  query: string
  nameOf: (userId: string) => string
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const { client } = useE2ee()
  const api = useApi()
  const queryClient = useQueryClient()
  const results = useQuery({
    queryKey: ['localSearch', channel.id, query],
    queryFn: () => client?.search(channel, query) ?? [],
    enabled: client !== null,
  })
  const found = results.data ?? []

  return (
    <aside
      aria-label={t('search.results')}
      className="fixed inset-0 z-40 flex w-full shrink-0 flex-col bg-sidebar lg:static lg:z-auto lg:w-80 lg:border-l lg:border-border"
    >
      <header className="flex h-12 shrink-0 items-center justify-between px-4">
        <h2 className="text-sm font-semibold">
          {results.isSuccess ? t('search.found', { count: found.length }) : t('search.results')}
        </h2>
        <button
          type="button"
          aria-label={t('search.close')}
          onClick={onClose}
          className="rounded p-1 text-muted hover:text-text"
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-2 text-xs text-muted">{t('e2ee.search.localOnly')}</p>
        {results.isSuccess && found.length === 0 ? (
          <p className="text-sm text-muted">{t('search.nothing')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {found.map((item) => {
            const createdAt = new Date(decodeSnowflake(item.id).timestamp).toISOString()
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void revealMessage(queryClient, api, channel.id, item.id)}
                  className="w-full rounded-md bg-main p-2.5 text-left text-sm hover:bg-hover"
                >
                  <span className="flex items-baseline gap-2 text-xs text-muted">
                    <span className="truncate font-semibold text-text">
                      {item.authorId ? nameOf(item.authorId) : t('messages.deletedUser')}
                    </span>
                    <time dateTime={createdAt} className="ml-auto shrink-0">
                      {formatMessageTime(createdAt, i18n.language)}
                    </time>
                  </span>
                  <span className="mt-1 line-clamp-4 block break-words whitespace-pre-wrap">
                    {item.text}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
