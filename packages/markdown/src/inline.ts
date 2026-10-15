import { readUrl } from './url'

import type { InlineNode, MentionNode, StyledNode } from './ast'

/** Deeper styles stay as text: keeps recursion bounded whatever the input. */
const MAX_DEPTH = 8

/**
 * Whole emoji sequences need the `v` flag (Safari 17+, Chrome 112+). Older engines would throw
 * on the literal and take the app down, so fall back to a close approximation there.
 */
const createEmojiPattern = (): RegExp => {
  try {
    return new RegExp('\\p{RGI_Emoji}', 'gv')
  } catch {
    return /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*/gu
  }
}

let emojiPattern: RegExp | null = null
const emoji = () => (emojiPattern ??= createEmojiPattern())
const WORD = /[\p{L}\p{N}_]/u

interface Match {
  readonly node: InlineNode
  readonly length: number
}

type Rule = (source: string, index: number, depth: number) => Match | null

/** A regex anchored at `index` (sticky), so every rule only looks at what is in front of it. */
const at = (pattern: RegExp, source: string, index: number) => {
  pattern.lastIndex = index
  return pattern.exec(source)
}

const isWordChar = (char: string | undefined) => char !== undefined && WORD.test(char)

/** Content must say something: `****` or `__ __` stay as they are. */
const hasContent = (content: string) => /[^\s*_~|]/.test(content)

const styled = (
  type: StyledNode['type'],
  pattern: RegExp,
  { wordBoundaries = false } = {},
): Rule => {
  return (source, index, depth) => {
    if (depth >= MAX_DEPTH) return null
    if (wordBoundaries && isWordChar(source[index - 1])) return null
    const match = at(pattern, source, index)
    const content = match?.[1]
    if (!match || content === undefined || !hasContent(content)) return null
    const length = match[0].length
    if (wordBoundaries && isWordChar(source[index + length])) return null
    return { node: { type, children: parseInline(content, depth + 1) }, length }
  }
}

const ESCAPE = /\\([^\p{L}\p{N}\s])/uy
// Ids are written canonically (no leading zeros), so one user is never two different ids.
const USER_MENTION = /<@!?([1-9]\d{0,18})>/y
const CUSTOM_EMOJI = /<(a?):([A-Za-z0-9_]{2,32}):([1-9]\d{0,18})>/y
const ROLE_MENTION = /<@&([1-9]\d{0,18})>/y
const CHANNEL_MENTION = /<#([1-9]\d{0,18})>/y
/** Snowflakes are signed 64-bit (Postgres bigint); anything larger is not an id. */
const MAX_SNOWFLAKE = 9_223_372_036_854_775_807n

const mention =
  (type: MentionNode['type'], pattern: RegExp): Rule =>
  (source, index) => {
    const match = at(pattern, source, index)
    const id = match?.[1]
    if (!match || id === undefined || BigInt(id) > MAX_SNOWFLAKE) return null
    return { node: { type, id }, length: match[0].length }
  }
const EVERYONE = /@(everyone|here)(?![\p{L}\p{N}_])/uy

const backtickRun = (source: string, from: number) => {
  let end = from
  while (source[end] === '`') end += 1
  return end - from
}

/**
 * `code` closed by a run of exactly as many backticks. Scanned by hand: a backreference regex
 * backtracks cubically on long backtick runs. An unclosed run is plain text, all of it.
 */
const readInlineCode: Rule = (source, index) => {
  const run = backtickRun(source, index)
  if (run === 0) return null
  let search = index + run
  while (search < source.length) {
    const next = source.indexOf('`', search)
    if (next === -1) break
    const length = backtickRun(source, next)
    if (length === run) {
      return {
        node: { type: 'inlineCode', value: source.slice(index + run, next) },
        length: next + run - index,
      }
    }
    search = next + length
  }
  return { node: { type: 'text', value: source.slice(index, index + run) }, length: run }
}

const rules: readonly Rule[] = [
  (source, index) => {
    const match = at(ESCAPE, source, index)
    return match ? { node: { type: 'text', value: match[1] as string }, length: 2 } : null
  },
  readInlineCode,
  (source, index) => {
    const url = readUrl(source, index)
    if (!url) return null
    return {
      node: { type: 'link', url: url.url, suppressEmbed: url.suppressEmbed },
      length: url.length,
    }
  },
  (source, index) => {
    const match = at(CUSTOM_EMOJI, source, index)
    if (!match) return null
    return {
      node: {
        type: 'customEmoji',
        animated: match[1] === 'a',
        name: match[2] as string,
        id: match[3] as string,
      },
      length: match[0].length,
    }
  },
  mention('userMention', USER_MENTION),
  mention('roleMention', ROLE_MENTION),
  mention('channelMention', CHANNEL_MENTION),
  (source, index) => {
    if (isWordChar(source[index - 1])) return null
    const match = at(EVERYONE, source, index)
    if (!match) return null
    return {
      node: { type: match[1] === 'everyone' ? 'everyone' : 'here' },
      length: match[0].length,
    }
  },
  styled('spoiler', /\|\|([\s\S]+?)\|\|/y),
  // `***x***` is bold italic: the strong rule takes the outer pair, italics the inner one.
  styled('bold', /\*\*([\s\S]+?)\*\*(?!\*)/y),
  styled('underline', /__([\s\S]+?)__(?!_)/y),
  // From simple-markdown (as Discord): `*` must hug the text, `**` inside is allowed.
  styled('italic', /\*(?=\S)((?:\*\*|\\[\s\S]|\s+(?:\\[\s\S]|[^\s*\\]|\*\*)|[^\s*\\])+?)\*(?!\*)/y),
  styled('italic', /_((?:__|\\[\s\S]|[^\\_])+?)_/y, { wordBoundaries: true }),
  styled('strike', /~~([\s\S]+?)~~(?!~)/y),
  (source, index) => (source[index] === '\n' ? { node: { type: 'lineBreak' }, length: 1 } : null),
]

/** Characters a rule can start with; everything else is plain text. */
const SPECIAL = /[\\`<hH@|*_~\n]/g

const nextSpecial = (source: string, from: number) => {
  SPECIAL.lastIndex = from
  return SPECIAL.exec(source)?.index ?? source.length
}

/** Splits emoji out of text, and merges neighbouring text. */
const finish = (nodes: readonly InlineNode[]): InlineNode[] => {
  const merged: InlineNode[] = []
  for (const node of nodes) {
    const last = merged.at(-1)
    if (node.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', value: last.value + node.value }
    } else {
      merged.push(node)
    }
  }
  return merged.flatMap((node) => (node.type === 'text' ? splitEmoji(node.value) : [node]))
}

const splitEmoji = (value: string): InlineNode[] => {
  const parts: InlineNode[] = []
  let last = 0
  for (const match of value.matchAll(emoji())) {
    if (match.index > last) parts.push({ type: 'text', value: value.slice(last, match.index) })
    parts.push({ type: 'emoji', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) })
  return parts
}

/** Inline markdown of one paragraph (newlines become line breaks). */
export const parseInline = (source: string, depth = 0): InlineNode[] => {
  const nodes: InlineNode[] = []
  let index = 0
  while (index < source.length) {
    const match = rules.reduce<Match | null>(
      (found, rule) => found ?? rule(source, index, depth),
      null,
    )
    if (match) {
      nodes.push(match.node)
      index += match.length
      continue
    }
    // Plain text up to the next character that could start something; at least one char.
    const end = Math.max(index + 1, nextSpecial(source, index + 1))
    nodes.push({ type: 'text', value: source.slice(index, end) })
    index = end
  }
  return finish(nodes)
}
