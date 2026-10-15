import type { BlockNode, InlineNode, MarkdownDocument } from './ast'

export interface Mentions {
  readonly users: readonly string[]
  readonly roles: readonly string[]
  readonly channels: readonly string[]
  readonly everyone: boolean
  readonly here: boolean
}

/** Up to this many emoji alone in a message are shown large. */
export const JUMBO_EMOJI_MAX = 30

const inlinesOf = (blocks: readonly BlockNode[]): InlineNode[] =>
  blocks.flatMap((block) => {
    if (block.type === 'paragraph') return [...block.children]
    if (block.type === 'quote') return inlinesOf(block.children)
    return []
  })

const flatten = (nodes: readonly InlineNode[]): InlineNode[] =>
  nodes.flatMap((node) => ('children' in node ? [node, ...flatten(node.children)] : [node]))

/** Who and what a message mentions (code is not markdown, so mentions there do not count). */
export const collectMentions = (doc: MarkdownDocument): Mentions => {
  const nodes = flatten(inlinesOf(doc))
  const ids = (type: InlineNode['type']) => [
    ...new Set(nodes.flatMap((node) => (node.type === type && 'id' in node ? [node.id] : []))),
  ]
  return {
    users: ids('userMention'),
    roles: ids('roleMention'),
    channels: ids('channelMention'),
    everyone: nodes.some((node) => node.type === 'everyone'),
    here: nodes.some((node) => node.type === 'here'),
  }
}

/** A message of nothing but a few emoji (and whitespace), shown large like in Discord. */
export const isEmojiOnly = (doc: MarkdownDocument): boolean => {
  if (doc.length === 0 || doc.some((block) => block.type !== 'paragraph')) return false
  const nodes = inlinesOf(doc)
  const isEmoji = (node: (typeof nodes)[number]) =>
    node.type === 'emoji' || node.type === 'customEmoji'
  const emoji = nodes.filter(isEmoji).length
  const onlyEmoji = nodes.every(
    (node) =>
      isEmoji(node) ||
      node.type === 'lineBreak' ||
      (node.type === 'text' && node.value.trim() === ''),
  )
  return onlyEmoji && emoji > 0 && emoji <= JUMBO_EMOJI_MAX
}
