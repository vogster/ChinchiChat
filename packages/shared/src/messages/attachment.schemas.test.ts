import { describe, expect, it } from 'vitest'

import {
  attachmentFilenameSchema,
  contentTypeSchema,
  createAttachmentRequestSchema,
  FILENAME_MAX_LENGTH,
  isInlineImage,
} from './attachment.schemas'

describe('attachmentFilenameSchema', () => {
  it.each([
    ['cat.png', 'cat.png'],
    ['  report final.pdf  ', 'report final.pdf'],
    ['C:\\Users\\me\\secret.txt', 'secret.txt'],
    ['../../etc/passwd', 'passwd'],
    ['bad\u0000na\u001fme\u007f.txt', 'badname.txt'],
    ['кот.jpg', 'кот.jpg'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(attachmentFilenameSchema.parse(input)).toBe(expected)
  })

  it.each(['', '   ', 'dir/', '\u0000', 'x'.repeat(FILENAME_MAX_LENGTH + 1)])(
    'rejects %j',
    (input) => {
      expect(attachmentFilenameSchema.safeParse(input).success).toBe(false)
    },
  )
})

describe('contentTypeSchema', () => {
  it('lowercases and keeps a bare type/subtype', () => {
    expect(contentTypeSchema.parse('Image/PNG')).toBe('image/png')
    expect(contentTypeSchema.parse('application/vnd.ms-excel')).toBe('application/vnd.ms-excel')
  })

  it.each(['png', 'text/html; charset=utf-8', 'image/', '/png', 'a b/c', `x/${'y'.repeat(130)}`])(
    'rejects %j',
    (input) => {
      expect(contentTypeSchema.safeParse(input).success).toBe(false)
    },
  )
})

describe('createAttachmentRequestSchema', () => {
  it('defaults the content type to a generic binary', () => {
    expect(createAttachmentRequestSchema.parse({ filename: 'a.bin', size: 10 })).toEqual({
      filename: 'a.bin',
      size: 10,
      contentType: 'application/octet-stream',
    })
  })

  it.each([
    { filename: 'a', size: 0 },
    { filename: 'a', size: 1.5 },
    { filename: 'a', size: -1 },
    { filename: 'a', size: 1, extra: true },
  ])('rejects %j', (body) => {
    expect(createAttachmentRequestSchema.safeParse(body).success).toBe(false)
  })
})

describe('isInlineImage', () => {
  it('is true only for raster formats browsers display safely', () => {
    expect(isInlineImage('image/png')).toBe(true)
    expect(isInlineImage('image/jpeg')).toBe(true)
    expect(isInlineImage('image/gif')).toBe(true)
    expect(isInlineImage('image/webp')).toBe(true)
    // SVG can carry scripts.
    expect(isInlineImage('image/svg+xml')).toBe(false)
    expect(isInlineImage('text/html')).toBe(false)
  })
})
