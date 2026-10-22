import { describe, expect, it } from 'vitest'

import {
  attachmentFilenameSchema,
  contentTypeSchema,
  createAttachmentRequestSchema,
  FILENAME_MAX_LENGTH,
  isInlineAudio,
  isInlineImage,
  safeFileName,
} from './attachment.schemas'

describe('attachmentFilenameSchema', () => {
  it.each([
    ['cat.png', 'cat.png'],
    ['  report final.pdf  ', 'report final.pdf'],
    ['C:\\Users\\me\\secret.txt', 'secret.txt'],
    ['../../etc/passwd', 'passwd'],
    ['bad\u0000na\u001fme\u007f.txt', 'badname.txt'],
    ['кот.jpg', 'кот.jpg'],
    // A right-to-left override would show "invoice\u202Efdp.exe" as "invoiceexe.pdf".
    ['invoice\u202Efdp.exe', 'invoicefdp.exe'],
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

describe('safeFileName', () => {
  it.each([
    ['отчёт.pdf', 'отчёт.pdf'],
    // A sender of an encrypted file picks its name: it must not lead out of the folder.
    [
      '..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\update.bat',
      'update.bat',
    ],
    ['../../.ssh/authorized_keys', 'authorized_keys'],
    ['C:\\Windows\\evil.dll', 'evil.dll'],
    ['invoice\u202Efdp.exe', 'invoicefdp.exe'],
    ['a<b>c:d"e|f?g*h.txt', 'a_b_c_d_e_f_g_h.txt'],
    ['notes.txt. . ', 'notes.txt'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['com1.log', '_com1.log'],
  ])('makes %j into %j', (input, expected) => {
    expect(safeFileName(input)).toBe(expected)
  })

  it.each(['', '   ', '..', '.', 'dir/', '\u202E'])('falls back for %j', (input) => {
    expect(safeFileName(input)).toBe('file')
  })

  it('keeps a long name within the limit, extension and all', () => {
    const name = safeFileName(`${'x'.repeat(400)}.pdf`)
    expect(name).toHaveLength(FILENAME_MAX_LENGTH)
    expect(name.endsWith('.pdf')).toBe(true)
  })
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

describe('isInlineAudio', () => {
  it('is true only for the containers voice messages come in', () => {
    expect(isInlineAudio('audio/webm')).toBe(true)
    expect(isInlineAudio('audio/ogg')).toBe(true)
    expect(isInlineAudio('audio/mp4')).toBe(true)
    expect(isInlineAudio('audio/webm;codecs=opus')).toBe(false)
    expect(isInlineAudio('video/webm')).toBe(false)
  })
})
