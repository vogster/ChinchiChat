import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { parseSearchQuery } from '@chinchi/shared'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { useApi } from '../../lib/api-context'
import { errorMessage } from '../../lib/errors'
import { membersQueryOptions } from '../guilds/queries'
import { useMemberNames } from '../guilds/use-member-names'
import { MentionResolverProvider } from '../markdown/mention-resolver-provider'
import { MessageContent } from '../markdown/message-content'
import { formatMessageTime } from '../messages/format-time'
import { useNsfwConsent } from '../guilds/use-nsfw-consent'
import { revealMessage } from '../messages/reveal-message'

import type { GuildDetail, Member, SearchMessagesQuery } from '@chinchi/shared'

const PAGE_SIZE = 25
/** The server counts matches up to this many. */
const SEARCH_TOTAL_CAP = 1000

type Resolved =
  | { readonly ok: true; readonly query: SearchMessagesQuery }
  | { readonly ok: false; readonly problem: 'member' | 'channel' | 'empty'; readonly name?: string }

/** The typed search, with names in its filters turned into ids. */
const resolve = (input: string, guild: GuildDetail, members: readonly Member[]): Resolved => {
  const parsed = parseSearchQuery(input)
  const query: {
    q?: string
    authorId?: string
    channelId?: string
    has?: SearchMessagesQuery['has']
  } = {}
  if (parsed.text) query.q = parsed.text
  if (parsed.from) {
    const name = parsed.from.toLowerCase()
    const member = members.find(
      (m) =>
        m.user.username.toLowerCase() === name ||
        m.nickname?.toLowerCase() === name ||
        m.user.displayName?.toLowerCase() === name,
    )
    if (!member) return { ok: false, problem: 'member', name: parsed.from }
    query.authorId = member.user.id
  }
  if (parsed.in) {
    const name = parsed.in.toLowerCase()
    const channel = guild.channels.find((c) => c.type === 'text' && c.name.toLowerCase() === name)
    if (!channel) return { ok: false, problem: 'channel', name: parsed.in }
    query.channelId = channel.id
  }
  if (parsed.has) query.has = parsed.has
  if (!query.q && !query.authorId && !query.has) return { ok: false, problem: 'empty' }
  return { ok: true, query }
}

/** Search results for a server, in place of the member list. */
export const SearchPanel = ({
  guild,
  input,
  onClose,
  onJumped,
}: {
  guild: GuildDetail
  input: string
  onClose: () => void
  /** A result was brought into view (narrow screens then close the panel to show it). */
  onJumped?: () => void
}) => {
  const { t, i18n } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const nameOf = useMemberNames(guild.id)
  const { data: members, isSuccess: membersLoaded } = useQuery(membersQueryOptions(api, guild.id))
  const resolved = membersLoaded ? resolve(input, guild, members) : null
  const query = resolved?.ok ? resolved.query : null
  const results = useInfiniteQuery({
    queryKey: ['search', guild.id, query],
    queryFn: ({ pageParam }) =>
      api.search.guild(guild.id, {
        ...query,
        ...(pageParam ? { before: pageParam } : {}),
        limit: PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.messages.length === PAGE_SIZE ? page.messages.at(-1)?.id : undefined,
    enabled: query !== null,
  })
  const jump = useRef<AbortController | null>(null)
  useEffect(() => () => jump.current?.abort(), [])
  const [missing, setMissing] = useState<string | null>(null)
  const [nsfwOk] = useNsfwConsent()
  const found = results.data?.pages.flatMap((page) => page.messages) ?? []
  const total = results.data?.pages[0]?.total ?? 0
  const channelOf = (id: string) => guild.channels.find((c) => c.id === id)

  const open = async (channelId: string, messageId: string) => {
    // A new jump cancels the previous one (and so does closing the panel).
    jump.current?.abort()
    const controller = new AbortController()
    jump.current = controller
    setMissing(null)
    await navigate({
      to: '/channels/$guildId/$channelId',
      params: { guildId: guild.id, channelId },
    })
    const reached = await revealMessage(queryClient, api, channelId, messageId, controller.signal)
    if (!reached && !controller.signal.aborted) setMissing(messageId)
    if (reached) onJumped?.()
  }

  return (
    <aside
      aria-label={t('search.results')}
      // Narrow screens: results cover the chat; wide ones show them beside it.
      className="fixed inset-0 z-40 flex w-full shrink-0 flex-col bg-sidebar lg:static lg:z-auto lg:w-80 lg:border-l lg:border-border"
    >
      <header className="flex h-12 shrink-0 items-center justify-between px-4">
        <h2 className="text-sm font-semibold">
          {results.isSuccess
            ? total >= SEARCH_TOTAL_CAP
              ? t('search.foundMany', { count: SEARCH_TOTAL_CAP })
              : t('search.found', { count: total })
            : t('search.results')}
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
        {resolved && !resolved.ok ? (
          <p className="text-sm text-muted">
            {t(`search.problems.${resolved.problem}`, { name: resolved.name })}
          </p>
        ) : null}
        {results.isError ? (
          <p className="text-sm text-red-400">{errorMessage(t, results.error)}</p>
        ) : null}
        {results.isSuccess && found.length === 0 ? (
          <p className="text-sm text-muted">{t('search.nothing')}</p>
        ) : null}
        <MentionResolverProvider guildId={guild.id}>
          <ul className="flex flex-col gap-2">
            {found.map((message) => (
              <li key={message.id} className="rounded-md bg-main p-2.5 text-sm">
                <div className="flex items-baseline gap-2 text-xs text-muted">
                  <span className="font-semibold text-text">
                    #{channelOf(message.channelId)?.name ?? '?'}
                  </span>
                  <span className="truncate">
                    {message.author ? nameOf(message.author) : t('messages.deletedUser')}
                  </span>
                  <time dateTime={message.createdAt} className="ml-auto shrink-0">
                    {formatMessageTime(message.createdAt, i18n.language)}
                  </time>
                </div>
                <div className="mt-1 line-clamp-4 break-words">
                  {/* Age-restricted channels stay behind their consent, here too. */}
                  {channelOf(message.channelId)?.nsfw && !nsfwOk ? (
                    <p className="text-muted italic">{t('search.nsfwHidden')}</p>
                  ) : (
                    <MessageContent content={message.content} />
                  )}
                </div>
                {missing === message.id ? (
                  <p role="status" className="mt-1 text-xs text-muted">
                    {t('search.missing')}
                  </p>
                ) : null}
                <Button
                  variant="link"
                  className="mt-1"
                  onClick={() => void open(message.channelId, message.id)}
                >
                  {t('search.jump')}
                </Button>
              </li>
            ))}
          </ul>
        </MentionResolverProvider>
        {results.hasNextPage ? (
          <Button
            variant="secondary"
            className="mt-3"
            pending={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            {t('search.more')}
          </Button>
        ) : null}
      </div>
    </aside>
  )
}
