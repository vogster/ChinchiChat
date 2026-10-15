import { z } from 'zod'

export const MAX_BLOCKED_WORDS = 200
export const BLOCKED_WORD_MAX_LENGTH = 50

const blockedWordSchema = z
  .string()
  .transform((word) => word.normalize('NFKC').trim().toLowerCase())
  .pipe(z.string().min(1).max(BLOCKED_WORD_MAX_LENGTH))

/** A server's automatic moderation; moderators (MANAGE_MESSAGES) are never held back. */
export const automodSettingsSchema = z.object({
  /** Messages containing any of these words or phrases (whole words, any case) are refused. */
  blockedWords: z.array(z.string()),
  /** Someone sending messages too fast is timed out for a few minutes. */
  antiSpam: z.boolean(),
  /** Messages mentioning more people or roles than this are refused; null is no limit. */
  maxMentions: z.number().int().positive().nullable(),
})

export const updateAutomodRequestSchema = z
  .strictObject({
    blockedWords: z
      .array(blockedWordSchema)
      .max(MAX_BLOCKED_WORDS)
      .transform((words) => [...new Set(words)])
      .optional(),
    antiSpam: z.boolean().optional(),
    maxMentions: z.number().int().min(1).max(50).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Case, look-alike forms and invisible format characters (zero-width, soft hyphen) aside. */
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()

// One compiled pattern per word list: messages are checked far more often than lists change.
const patterns = new Map<string, readonly { word: string; pattern: RegExp }[]>()
const MAX_CACHED_LISTS = 500

const compile = (words: readonly string[]) => {
  const key = words.join('\n')
  const cached = patterns.get(key)
  if (cached) return cached
  const compiled = words.map((word) => ({
    word,
    pattern: new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(normalize(word))}(?![\\p{L}\\p{N}])`,
      'u',
    ),
  }))
  if (patterns.size >= MAX_CACHED_LISTS) patterns.clear()
  patterns.set(key, compiled)
  return compiled
}

/**
 * The first blocked word the text contains as a whole word (or phrase), ignoring case,
 * Unicode look-alike forms and invisible characters; null when there is none.
 */
export const findBlockedWord = (text: string, words: readonly string[]): string | null => {
  if (words.length === 0) return null
  const normalized = normalize(text)
  return compile(words).find(({ pattern }) => pattern.test(normalized))?.word ?? null
}

export type AutomodSettings = z.infer<typeof automodSettingsSchema>
export type UpdateAutomodRequest = z.input<typeof updateAutomodRequestSchema>
