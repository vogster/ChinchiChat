import { parseSearchQuery } from '@chinchi/shared'

import type { SearchMessagesQuery } from '@chinchi/shared'

export type ResolvedSearch =
  | { readonly ok: true; readonly query: SearchMessagesQuery }
  | {
      readonly ok: false
      readonly problem: 'member' | 'person' | 'channel' | 'empty'
      readonly name?: string
    }

export interface SearchScope {
  /** The id of who a `from:` name means (lowercased), if anyone. */
  readonly authorNamed: (name: string) => string | undefined
  /** The id of the channel an `in:` name means; without it, `in:` is ignored. */
  readonly channelNamed?: (name: string) => string | undefined
  /** How to say that `from:` names nobody: on a server, or in a conversation. */
  readonly unknownAuthor: 'member' | 'person'
}

/** The typed search, with names in its filters turned into ids. */
export const resolveSearch = (input: string, scope: SearchScope): ResolvedSearch => {
  const parsed = parseSearchQuery(input)
  const query: {
    q?: string
    authorId?: string
    channelId?: string
    has?: SearchMessagesQuery['has']
  } = {}
  if (parsed.text) query.q = parsed.text
  if (parsed.from) {
    const authorId = scope.authorNamed(parsed.from.toLowerCase())
    if (!authorId) return { ok: false, problem: scope.unknownAuthor, name: parsed.from }
    query.authorId = authorId
  }
  if (parsed.in && scope.channelNamed) {
    const channelId = scope.channelNamed(parsed.in.toLowerCase())
    if (!channelId) return { ok: false, problem: 'channel', name: parsed.in }
    query.channelId = channelId
  }
  if (parsed.has) query.has = parsed.has
  if (!query.q && !query.authorId && !query.has) return { ok: false, problem: 'empty' }
  return { ok: true, query }
}
