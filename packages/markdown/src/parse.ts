import { parseInline } from './inline'

import type { BlockNode, MarkdownDocument } from './ast'

export { parseInline } from './inline'

/** ```lang\ncode``` (the language only when a newline follows it) or ```code```. */
const CODE_FENCE = /```(?:([\w+#.-]{1,32})\n)?([\s\S]*?)```/y

const QUOTE_LINE = '> '
const QUOTE_REST = '>>> '

/** One newline next to a block belongs to it, not to the text around. */
const trimOneNewline = (text: string) => text.replace(/^\n/, '').replace(/\n$/, '')

const readCodeBlock = (source: string, index: number) => {
  CODE_FENCE.lastIndex = index
  const match = CODE_FENCE.exec(source)
  if (!match || (match[2] as string).trim().length === 0) return null
  const node: BlockNode = {
    type: 'codeBlock',
    lang: match[1] ?? null,
    value: trimOneNewline(match[2] as string),
  }
  return { node, end: index + match[0].length }
}

/** Consecutive `> ` lines from `index`, without the markers. */
const readQuoteLines = (source: string, index: number) => {
  const lines: string[] = []
  let end = index
  while (end < source.length && source.startsWith(QUOTE_LINE, end)) {
    const newline = source.indexOf('\n', end)
    const lineEnd = newline === -1 ? source.length : newline
    lines.push(source.slice(end + QUOTE_LINE.length, lineEnd))
    end = newline === -1 ? source.length : newline + 1
  }
  return { content: lines.join('\n'), end }
}

/**
 * Blocks in order, like Discord: whatever starts at the current position wins. So a code block
 * keeps its `> ` lines as code, and a quote may contain code. Quotes do not nest.
 */
const parseBlocks = (source: string, inQuote: boolean): BlockNode[] => {
  const blocks: BlockNode[] = []
  let text = ''
  const flush = () => {
    const paragraph = text.replace(/\n$/, '')
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', children: parseInline(paragraph) })
    text = ''
  }

  let index = 0
  while (index < source.length) {
    const atLineStart = index === 0 || source[index - 1] === '\n'

    const code = source.startsWith('```', index) ? readCodeBlock(source, index) : null
    if (code) {
      flush()
      blocks.push(code.node)
      index = source[code.end] === '\n' ? code.end + 1 : code.end
      continue
    }
    if (!inQuote && atLineStart && source.startsWith(QUOTE_REST, index)) {
      flush()
      blocks.push({
        type: 'quote',
        children: parseBlocks(source.slice(index + QUOTE_REST.length), true),
      })
      return blocks
    }
    if (!inQuote && atLineStart && source.startsWith(QUOTE_LINE, index)) {
      flush()
      const quote = readQuoteLines(source, index)
      blocks.push({ type: 'quote', children: parseBlocks(quote.content, true) })
      index = quote.end
      continue
    }

    // Plain text up to the end of the line or the next possible code fence.
    const newline = source.indexOf('\n', index)
    const fence = source.indexOf('```', source.startsWith('```', index) ? index + 3 : index)
    const lineEnd = newline === -1 ? source.length : newline + 1
    const end = fence !== -1 && fence < lineEnd ? fence : lineEnd
    text += source.slice(index, end)
    index = end
  }
  flush()
  return blocks
}

/** Parses a message into blocks of inline markdown; nothing inside code blocks is markdown. */
export const parseMarkdown = (source: string): MarkdownDocument => parseBlocks(source, false)
