import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { messageSchema } from './message.schemas'

export const SEARCH_QUERY_MAX_LENGTH = 200
export const searchHasSchema = z.enum(['link', 'file', 'image', 'embed'])

/**
 * Message search. `q` is matched as words (stemmed for Russian and English); the other
 * fields narrow it down. At least one of `q`, `authorId` or `has` is required.
 */
export const searchMessagesQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(SEARCH_QUERY_MAX_LENGTH)
      .optional()
      .transform((q) => (q ? q : undefined)),
    authorId: snowflakeSchema.optional(),
    /** Server-wide search only: one channel of the server. */
    channelId: snowflakeSchema.optional(),
    has: searchHasSchema.optional(),
    before: snowflakeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .transform((query) =>
    Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined)),
  )
  .pipe(
    z
      .object({
        q: z.string().optional(),
        authorId: snowflakeSchema.optional(),
        channelId: snowflakeSchema.optional(),
        has: searchHasSchema.optional(),
        before: snowflakeSchema.optional(),
        limit: z.number(),
      })
      .refine(
        (query) => query.q !== undefined || query.authorId !== undefined || query.has !== undefined,
        'Search for words, an author or a kind of content',
      ),
  )

export const searchResultSchema = z.object({
  messages: z.array(messageSchema),
  /**
   * All matches, not only this page, counted up to 1000 (more shows as "1000+"); null on
   * later pages (`before`), where the first page's count stands.
   */
  total: z.number().int().nonnegative().nullable(),
})

export type SearchHas = z.infer<typeof searchHasSchema>
export type SearchMessagesQuery = z.input<typeof searchMessagesQuerySchema>
export type SearchResult = z.infer<typeof searchResultSchema>

export interface ParsedSearch {
  readonly text: string
  /** A username, without the @. */
  readonly from?: string
  /** A channel name, without the #. */
  readonly in?: string
  readonly has?: SearchHas
}

const FILTER = /^(from|in|has):(\S+)$/i

/**
 * What the user typed in the search box, split into words and `from:` / `in:` / `has:`
 * filters (as in Discord). Unrecognised filters stay part of the text.
 */
export const parseSearchQuery = (input: string): ParsedSearch => {
  const words: string[] = []
  const filters: { from?: string; in?: string; has?: SearchHas } = {}
  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    const match = FILTER.exec(token)
    const key = match?.[1]?.toLowerCase()
    const value = match?.[2] ?? ''
    if (key === 'from') filters.from = value.replace(/^@/, '')
    else if (key === 'in') filters.in = value.replace(/^#/, '')
    else if (key === 'has' && searchHasSchema.safeParse(value.toLowerCase()).success) {
      filters.has = value.toLowerCase() as SearchHas
    } else words.push(token)
  }
  return { text: words.join(' '), ...filters }
}
