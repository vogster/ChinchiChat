/** Something `@` or `#` can turn into a mention token. */
export interface MentionCandidate {
  readonly key: string
  readonly kind: 'user' | 'role' | 'everyone' | 'channel'
  /** What goes into the message: `<@id>`, `<@&id>`, `<#id>`, `@everyone`. */
  readonly text: string
  /** How it is shown in the list. */
  readonly label: string
  /** A hint after the label: the username, "role", the channel's category. */
  readonly detail?: string | undefined
  /** Words the typed query is matched against (lowercase). */
  readonly terms: readonly string[]
  /** For people: their id and picture. */
  readonly user?: { readonly id: string; readonly avatarUrl: string | null } | undefined
  /** For roles: their colour. */
  readonly color?: number | undefined
}

export interface MentionQuery {
  readonly trigger: '@' | '#'
  /** Typed after the trigger, lowercase. */
  readonly query: string
  /** Where the trigger is in the text. */
  readonly start: number
  /** Where the caret is: the query ends here. */
  readonly end: number
}

export const MAX_MENTION_SUGGESTIONS = 8

// The trigger opens a word (start of text or after whitespace) and the word is still being typed.
const QUERY = /(?:^|\s)([@#])([^\s@#<>]{0,32})$/u

/** The mention being typed right before the caret, if any. */
export const findMentionQuery = (value: string, caret: number): MentionQuery | null => {
  const match = QUERY.exec(value.slice(0, caret))
  if (!match) return null
  const typed = match[2] as string
  return {
    trigger: match[1] as '@' | '#',
    query: typed.toLocaleLowerCase(),
    start: caret - typed.length - 1,
    end: caret,
  }
}

const KINDS: Record<MentionQuery['trigger'], readonly MentionCandidate['kind'][]> = {
  '@': ['user', 'role', 'everyone'],
  '#': ['channel'],
}

/** Candidates for the query: names starting with it first, then names containing it. */
export const matchMentions = (
  candidates: readonly MentionCandidate[],
  { trigger, query }: MentionQuery,
): MentionCandidate[] => {
  const kinds = KINDS[trigger]
  const of = candidates.filter((candidate) => kinds.includes(candidate.kind))
  if (query === '') return of.slice(0, MAX_MENTION_SUGGESTIONS)
  const starts = of.filter((c) => c.terms.some((term) => term.startsWith(query)))
  const contains = of.filter(
    (c) => !starts.includes(c) && c.terms.some((term) => term.includes(query)),
  )
  return [...starts, ...contains].slice(0, MAX_MENTION_SUGGESTIONS)
}

/** The text with the typed query replaced by the mention, and where the caret goes next. */
export const applyMention = (
  value: string,
  { start, end }: MentionQuery,
  candidate: MentionCandidate,
): { value: string; caret: number } => {
  const inserted = `${candidate.text} `
  return {
    value: value.slice(0, start) + inserted + value.slice(end).replace(/^ /, ''),
    caret: start + inserted.length,
  }
}
