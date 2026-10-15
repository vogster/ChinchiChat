import { describe, expect, it } from 'vitest'

import { parseInline, parseMarkdown } from './parse'

import type { InlineNode } from './ast'

const text = (value: string): InlineNode => ({ type: 'text', value })
const para = (...children: InlineNode[]) => ({ type: 'paragraph', children })

describe('parseInline: styles', () => {
  it.each([
    ['**bold**', [{ type: 'bold', children: [text('bold')] }]],
    ['*italic*', [{ type: 'italic', children: [text('italic')] }]],
    ['_italic_', [{ type: 'italic', children: [text('italic')] }]],
    ['__underline__', [{ type: 'underline', children: [text('underline')] }]],
    ['~~strike~~', [{ type: 'strike', children: [text('strike')] }]],
    ['||spoiler||', [{ type: 'spoiler', children: [text('spoiler')] }]],
    ['`code`', [{ type: 'inlineCode', value: 'code' }]],
  ])('%s', (input, expected) => {
    expect(parseInline(input)).toEqual(expected)
  })

  it('nests styles', () => {
    expect(parseInline('**bold *both* bold**')).toEqual([
      {
        type: 'bold',
        children: [text('bold '), { type: 'italic', children: [text('both')] }, text(' bold')],
      },
    ])
    expect(parseInline('*a **b** c*')).toEqual([
      {
        type: 'italic',
        children: [text('a '), { type: 'bold', children: [text('b')] }, text(' c')],
      },
    ])
    expect(parseInline('***both***')).toEqual([
      { type: 'bold', children: [{ type: 'italic', children: [text('both')] }] },
    ])
    expect(parseInline('||**hidden**||')).toEqual([
      { type: 'spoiler', children: [{ type: 'bold', children: [text('hidden')] }] },
    ])
  })

  it('keeps text around styles', () => {
    expect(parseInline('a **b** c')).toEqual([
      text('a '),
      { type: 'bold', children: [text('b')] },
      text(' c'),
    ])
  })

  it.each([
    ['unclosed', '**not bold', [text('**not bold')]],
    ['empty', '****', [text('****')]],
    ['spaced asterisks', 'a * b * c', [text('a * b * c')]],
    ['snake_case words', 'snake_case_name', [text('snake_case_name')]],
  ])('leaves %s markers as text', (_case, input, expected) => {
    expect(parseInline(input)).toEqual(expected)
  })

  it('does not parse inside inline code', () => {
    expect(parseInline('`**not bold** <@1>`')).toEqual([
      { type: 'inlineCode', value: '**not bold** <@1>' },
    ])
    expect(parseInline('``has ` tick``')).toEqual([{ type: 'inlineCode', value: 'has ` tick' }])
  })

  it('honours backslash escapes', () => {
    expect(parseInline('\\*\\*not bold\\*\\*')).toEqual([text('**not bold**')])
    expect(parseInline('\\<@123>')).toEqual([text('<@123>')])
    expect(parseInline('a\\b')).toEqual([text('a\\b')])
  })
})

describe('parseInline: mentions, links, emoji', () => {
  it('parses mentions', () => {
    expect(parseInline('<@123> <@!45> <@&6> <#78> @everyone @here')).toEqual([
      { type: 'userMention', id: '123' },
      text(' '),
      { type: 'userMention', id: '45' },
      text(' '),
      { type: 'roleMention', id: '6' },
      text(' '),
      { type: 'channelMention', id: '78' },
      text(' '),
      { type: 'everyone' },
      text(' '),
      { type: 'here' },
    ])
  })

  it.each(['<@0012>', '<@99999999999999999999>', '<@0>'])(
    'leaves %s as text: not a valid snowflake',
    (input) => {
      expect(parseInline(input)).toEqual([text(input)])
    },
  )

  it('needs word boundaries around @everyone', () => {
    expect(parseInline('mail@everyone.com')).toEqual([text('mail@everyone.com')])
    expect(parseInline('@everyones')).toEqual([text('@everyones')])
  })

  it('links http(s) URLs, trimming trailing punctuation', () => {
    expect(parseInline('see https://example.com/a?b=1, then.')).toEqual([
      text('see '),
      { type: 'link', url: 'https://example.com/a?b=1', suppressEmbed: false },
      text(', then.'),
    ])
    expect(parseInline('(http://x.test/path)')).toEqual([
      text('('),
      { type: 'link', url: 'http://x.test/path', suppressEmbed: false },
      text(')'),
    ])
  })

  it('keeps balanced parentheses in URLs', () => {
    expect(parseInline('https://en.wikipedia.org/wiki/Rust_(language)')).toEqual([
      { type: 'link', url: 'https://en.wikipedia.org/wiki/Rust_(language)', suppressEmbed: false },
    ])
  })

  it.each([
    ['bidi controls', `https://a.com/${String.fromCharCode(0x202e)}moc.elgoog`, 'https://a.com/'],
    ['zero-width spaces', `https://a.com/x${String.fromCharCode(0x200b)}y`, 'https://a.com/x'],
  ])('stops URLs at %s', (_case, input, url) => {
    expect(parseInline(input)[0]).toEqual({ type: 'link', url, suppressEmbed: false })
  })

  it('never links URLs with credentials, which hide the real host', () => {
    expect(parseInline('https://google.com@evil.com').some((n) => n.type === 'link')).toBe(false)
  })

  it('ends URLs before > and spoiler bars', () => {
    expect(parseInline('\\<https://a.com>')).toEqual([
      text('<'),
      { type: 'link', url: 'https://a.com', suppressEmbed: false },
      text('>'),
    ])
    expect(parseInline('||https://a.com||')).toEqual([
      {
        type: 'spoiler',
        children: [{ type: 'link', url: 'https://a.com', suppressEmbed: false }],
      },
    ])
  })

  it('suppresses previews for <url>', () => {
    expect(parseInline('<https://example.com>')).toEqual([
      { type: 'link', url: 'https://example.com', suppressEmbed: true },
    ])
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.test', 'https://'])(
    'never links %s',
    (input) => {
      expect(parseInline(input).every((node) => node.type !== 'link')).toBe(true)
    },
  )

  it('does not style inside URLs', () => {
    expect(parseInline('https://x.test/a_b_c/**d**')).toEqual([
      { type: 'link', url: 'https://x.test/a_b_c/**d**', suppressEmbed: false },
    ])
  })

  it('marks emoji', () => {
    expect(parseInline('hi 👋🏽 🇷🇺 👨‍👩‍👧!')).toEqual([
      text('hi '),
      { type: 'emoji', value: '👋🏽' },
      text(' '),
      { type: 'emoji', value: '🇷🇺' },
      text(' '),
      { type: 'emoji', value: '👨‍👩‍👧' },
      text('!'),
    ])
  })

  it('turns newlines into line breaks', () => {
    expect(parseInline('a\nb')).toEqual([text('a'), { type: 'lineBreak' }, text('b')])
  })
})

describe('parseMarkdown: blocks', () => {
  it('keeps plain lines in one paragraph', () => {
    expect(parseMarkdown('one\ntwo')).toEqual([
      para(text('one'), { type: 'lineBreak' }, text('two')),
    ])
  })

  it('parses fenced code blocks with an optional language', () => {
    expect(parseMarkdown('before\n```ts\nconst a = 1 // **x**\n```\nafter')).toEqual([
      para(text('before')),
      { type: 'codeBlock', lang: 'ts', value: 'const a = 1 // **x**' },
      para(text('after')),
    ])
    expect(parseMarkdown('```\nplain\n```')).toEqual([
      { type: 'codeBlock', lang: null, value: 'plain' },
    ])
    expect(parseMarkdown('```one line```')).toEqual([
      { type: 'codeBlock', lang: null, value: 'one line' },
    ])
  })

  it('treats an unclosed fence as text', () => {
    expect(parseMarkdown('```ts\ncode')).toEqual([
      para(text('```ts'), { type: 'lineBreak' }, text('code')),
    ])
  })

  it('parses quotes line by line', () => {
    expect(parseMarkdown('> quoted **bold**\n> more\nreply')).toEqual([
      {
        type: 'quote',
        children: [
          para(
            text('quoted '),
            { type: 'bold', children: [text('bold')] },
            { type: 'lineBreak' },
            text('more'),
          ),
        ],
      },
      para(text('reply')),
    ])
  })

  it('quotes the rest of the message after >>>', () => {
    expect(parseMarkdown('intro\n>>> all\nof this')).toEqual([
      para(text('intro')),
      { type: 'quote', children: [para(text('all'), { type: 'lineBreak' }, text('of this'))] },
    ])
  })

  it('keeps code blocks inside quotes', () => {
    expect(parseMarkdown('> look\n> ```js\n> code\n> ```\nafter')).toEqual([
      {
        type: 'quote',
        children: [para(text('look')), { type: 'codeBlock', lang: 'js', value: 'code' }],
      },
      para(text('after')),
    ])
    expect(parseMarkdown('>>> text\n```x```\nmore')).toEqual([
      {
        type: 'quote',
        children: [
          para(text('text')),
          { type: 'codeBlock', lang: null, value: 'x' },
          para(text('more')),
        ],
      },
    ])
  })

  it('does not turn > lines inside code into quotes', () => {
    expect(parseMarkdown('```sh\n> npm i\n```')).toEqual([
      { type: 'codeBlock', lang: 'sh', value: '> npm i' },
    ])
  })

  it('does not nest quotes', () => {
    expect(parseMarkdown('> > deeper')).toEqual([
      { type: 'quote', children: [para(text('> deeper'))] },
    ])
  })

  it('needs a space after >', () => {
    expect(parseMarkdown('>not a quote')).toEqual([para(text('>not a quote'))])
  })

  it('returns nothing for empty input', () => {
    expect(parseMarkdown('')).toEqual([])
  })
})

describe('robustness', () => {
  it('handles pathological input quickly', () => {
    const inputs = [
      '*'.repeat(2000),
      '_'.repeat(2000),
      '**a'.repeat(600),
      '`'.repeat(2000),
      '||'.repeat(1000),
      'https://x.test/' + '('.repeat(1900),
      '<@'.repeat(1000),
      `${'*a '.repeat(600)}`,
    ]
    // Catastrophic backtracking takes seconds or never ends; the budget only has to tell that
    // apart from normal parsing on a loaded CI machine with coverage on (where 200ms was flaky).
    for (const input of inputs) {
      parseMarkdown(input) // warm-up: the first run pays for JIT compilation
      const started = performance.now()
      parseMarkdown(input)
      expect(performance.now() - started).toBeLessThan(1000)
    }
  })

  it('limits nesting depth', () => {
    const deep = `${'||**'.repeat(50)}x${'**||'.repeat(50)}`
    expect(() => parseMarkdown(deep)).not.toThrow()
  })
})

describe('parseInline: custom emoji', () => {
  it('reads <:name:id> and <a:name:id>', () => {
    expect(parseInline('hi <:party_cat:123> and <a:dance:456>')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'customEmoji', name: 'party_cat', id: '123', animated: false },
      { type: 'text', value: ' and ' },
      { type: 'customEmoji', name: 'dance', id: '456', animated: true },
    ])
  })

  it('leaves malformed ones as text', () => {
    expect(parseInline('<:x:123>')).toEqual([{ type: 'text', value: '<:x:123>' }])
    expect(parseInline('<:ok:abc>')).toEqual([{ type: 'text', value: '<:ok:abc>' }])
    expect(parseInline('`<:ok:1>`')).toEqual([{ type: 'inlineCode', value: '<:ok:1>' }])
  })
})
