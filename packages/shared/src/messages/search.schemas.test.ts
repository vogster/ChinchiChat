import { describe, expect, it } from 'vitest'

import { parseSearchQuery, searchMessagesQuerySchema } from './search.schemas'

describe('parseSearchQuery', () => {
  it('splits filters from the words', () => {
    expect(parseSearchQuery('from:bob in:#общий has:file кот в  сапогах')).toEqual({
      text: 'кот в сапогах',
      from: 'bob',
      in: 'общий',
      has: 'file',
    })
  })

  it('keeps plain text as is and ignores unknown "has" values', () => {
    expect(parseSearchQuery('  привет мир ')).toEqual({ text: 'привет мир' })
    expect(parseSearchQuery('has:whatever http://x')).toEqual({ text: 'has:whatever http://x' })
  })

  it('takes the last value when a filter repeats, and @-prefixed names', () => {
    expect(parseSearchQuery('from:@alice from:bob')).toEqual({ text: '', from: 'bob' })
  })
})

describe('searchMessagesQuerySchema', () => {
  it('needs words or a filter', () => {
    expect(searchMessagesQuerySchema.safeParse({}).success).toBe(false)
    expect(searchMessagesQuerySchema.safeParse({ q: '   ' }).success).toBe(false)
    expect(searchMessagesQuerySchema.parse({ q: ' кот ' })).toEqual({ q: 'кот', limit: 25 })
    expect(searchMessagesQuerySchema.parse({ has: 'link' })).toEqual({ has: 'link', limit: 25 })
    expect(searchMessagesQuerySchema.safeParse({ has: 'pdf' }).success).toBe(false)
  })
})
