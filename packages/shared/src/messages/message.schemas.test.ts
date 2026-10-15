import { describe, expect, it } from 'vitest'

import { ATTACHMENTS_PER_MESSAGE_MAX } from './attachment.schemas'
import {
  MESSAGE_MAX_LENGTH,
  REPLY_SNIPPET_LENGTH,
  replySnippetText,
  createMessageRequestSchema,
  listMessagesQuerySchema,
  updateMessageRequestSchema,
} from './message.schemas'

describe('createMessageRequestSchema', () => {
  it('trims surrounding whitespace but keeps inner newlines', () => {
    expect(createMessageRequestSchema.parse({ content: '  hi\n\nthere  ' })).toEqual({
      content: 'hi\n\nthere',
    })
  })

  it('accepts a client nonce for optimistic sends', () => {
    expect(createMessageRequestSchema.parse({ content: 'hi', nonce: 'abc-123' }).nonce).toBe(
      'abc-123',
    )
  })

  it.each([
    { content: '' },
    { content: '   \n  ' },
    { content: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) },
    { content: 'hi', nonce: 'x'.repeat(65) },
    { content: 'hi', extra: true },
  ])('rejects %j', (body) => {
    expect(createMessageRequestSchema.safeParse(body).success).toBe(false)
  })

  it('allows an empty text when files are attached', () => {
    expect(createMessageRequestSchema.parse({ attachmentIds: ['1', '2'] })).toEqual({
      content: '',
      attachmentIds: ['1', '2'],
    })
    expect(createMessageRequestSchema.parse({ content: ' ', attachmentIds: ['1'] }).content).toBe(
      '',
    )
  })

  it.each([
    { attachmentIds: [] },
    { content: '', attachmentIds: [] },
    { attachmentIds: ['1', '1'] },
    { attachmentIds: Array.from({ length: ATTACHMENTS_PER_MESSAGE_MAX + 1 }, (_, i) => `${i}`) },
    { attachmentIds: ['x'] },
  ])('rejects attachments %j', (body) => {
    expect(createMessageRequestSchema.safeParse(body).success).toBe(false)
  })

  it('replies to a message, mentioning its author by default', () => {
    expect(createMessageRequestSchema.parse({ content: 'yes', replyTo: '42' })).toEqual({
      content: 'yes',
      replyTo: '42',
      replyMention: true,
    })
    expect(
      createMessageRequestSchema.parse({ content: 'yes', replyTo: '42', replyMention: false })
        .replyMention,
    ).toBe(false)
    expect(createMessageRequestSchema.safeParse({ content: 'yes', replyTo: 'x' }).success).toBe(
      false,
    )
  })

  it('allows exactly the maximum length', () => {
    expect(
      createMessageRequestSchema.safeParse({ content: 'x'.repeat(MESSAGE_MAX_LENGTH) }).success,
    ).toBe(true)
  })
})

describe('replySnippetText', () => {
  it('keeps the first characters without splitting emoji', () => {
    const text = `${'a'.repeat(REPLY_SNIPPET_LENGTH - 1)}🎉🎉`
    expect(replySnippetText(text)).toBe(`${'a'.repeat(REPLY_SNIPPET_LENGTH - 1)}🎉`)
    expect(replySnippetText('short')).toBe('short')
  })
})

describe('updateMessageRequestSchema', () => {
  it('requires non-empty content', () => {
    expect(updateMessageRequestSchema.safeParse({ content: ' ' }).success).toBe(false)
    expect(updateMessageRequestSchema.parse({ content: ' edited ' })).toEqual({ content: 'edited' })
  })
})

describe('listMessagesQuerySchema', () => {
  it('defaults to the latest 50', () => {
    expect(listMessagesQuerySchema.parse({})).toEqual({ limit: 50 })
  })

  it('coerces query-string numbers', () => {
    expect(listMessagesQuerySchema.parse({ before: '123', limit: '20' })).toEqual({
      before: '123',
      limit: 20,
    })
  })

  it.each([{ limit: '0' }, { limit: '101' }, { before: '1', after: '2' }, { before: 'x' }])(
    'rejects %j',
    (query) => {
      expect(listMessagesQuerySchema.safeParse(query).success).toBe(false)
    },
  )
})
