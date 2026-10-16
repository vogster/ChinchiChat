import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { collectMentions, isEmojiOnly } from './analyze'
import { parseMarkdown } from './parse'

import type { BlockNode, InlineNode } from './ast'

const BLOCK_TYPES = new Set(['paragraph', 'codeBlock', 'quote'])
const INLINE_TYPES = new Set([
  'text',
  'bold',
  'italic',
  'underline',
  'strike',
  'spoiler',
  'inlineCode',
  'link',
  'userMention',
  'roleMention',
  'channelMention',
  'everyone',
  'here',
  'emoji',
  'customEmoji',
  'lineBreak',
])

const inlineNodes = (node: InlineNode): InlineNode[] => [
  node,
  ...('children' in node ? node.children.flatMap(inlineNodes) : []),
]
const inlinesOf = (block: BlockNode): InlineNode[] =>
  block.type === 'codeBlock'
    ? []
    : block.type === 'quote'
      ? block.children.flatMap(inlinesOf)
      : block.children.flatMap(inlineNodes)

/** Text that no markdown syntax starts with: letters, digits and single spaces. */
const plainWord = fc.stringMatching(/^[A-Za-z0-9А-я]{1,12}$/u)
const plainText = fc
  .array(plainWord, { minLength: 1, maxLength: 8 })
  .map((words) => words.join(' '))

/** Pieces of real syntax, mixed with anything: the parser has to cope with every combination. */
const syntaxSoup = fc
  .array(
    fc.oneof(
      fc.string({ maxLength: 6 }),
      fc.constantFrom(
        '**',
        '*',
        '__',
        '~~',
        '||',
        '`',
        '```',
        '\n',
        '> ',
        '>>> ',
        '<@1>',
        '<@&2>',
        '<#3>',
        '@everyone',
        '@here',
        '<:smile:4>',
        '<a:wave:5>',
        'https://a.b/',
        '[x](https://e.f)',
        ':smile:',
        '\\',
      ),
    ),
    { maxLength: 24 },
  )
  .map((parts) => parts.join(''))

describe('parseMarkdown, for any input', () => {
  it('never throws and only produces known node types', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 200 }), syntaxSoup), (source) => {
        const doc = parseMarkdown(source)
        expect(Array.isArray(doc)).toBe(true)
        for (const block of doc) {
          expect(BLOCK_TYPES.has(block.type)).toBe(true)
          for (const node of inlinesOf(block)) expect(INLINE_TYPES.has(node.type)).toBe(true)
        }
        expect(() => collectMentions(doc)).not.toThrow()
        expect(typeof isEmojiOnly(doc)).toBe('boolean')
      }),
      { numRuns: 500 },
    )
  })

  it('is deterministic', () => {
    fc.assert(
      fc.property(syntaxSoup, (source) => {
        expect(parseMarkdown(source)).toEqual(parseMarkdown(source))
      }),
    )
  })

  it('keeps plain text as it is: one paragraph whose text reads back the same', () => {
    fc.assert(
      fc.property(plainText, (source) => {
        const doc = parseMarkdown(source)
        expect(doc).toHaveLength(1)
        const [block] = doc
        expect(block?.type).toBe('paragraph')
        const text = inlinesOf(block as BlockNode)
          .filter((node) => node.type === 'text')
          .map((node) => node.value)
          .join('')
        expect(text).toBe(source)
      }),
    )
  })

  it('finds every mention it is given, whatever surrounds it', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 999_999 }), { minLength: 1, maxLength: 5 }),
        plainText,
        (ids, filler) => {
          const source = ids.map((id) => `<@${id}> ${filler}`).join(' ')
          const { users } = collectMentions(parseMarkdown(source))
          expect([...users].sort()).toEqual([...new Set(ids.map(String))].sort())
        },
      ),
    )
  })
})
