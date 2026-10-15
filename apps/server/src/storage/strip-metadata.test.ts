import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import { UnreadableImage, readJpegOrientation, stripMetadata } from './strip-metadata'

const bytes = (...parts: (number[] | string | Uint8Array)[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...Buffer.from(part, 'latin1')] : [...part],
    ),
  )
const be16 = (n: number) => [n >> 8, n & 0xff]
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
const be32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
const contains = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, 'latin1'))

/** A big-endian EXIF block: orientation plus a pretend GPS entry. */
const exif = (orientation: number) => {
  const tiff = bytes(
    'MM',
    [0, 42],
    be32(8),
    be16(2),
    [1, 0x12],
    be16(3),
    be32(1),
    be16(orientation),
    [0, 0],
    [0x88, 0x25],
    be16(4),
    be32(1),
    be32(0),
    be32(0),
    'GPS-SECRET',
  )
  return bytes('Exif', [0, 0], tiff)
}
const segment = (marker: number, payload: Uint8Array) =>
  bytes([0xff, marker], be16(payload.length + 2), payload)

const jpeg = (...segments: Uint8Array[]) =>
  bytes([0xff, 0xd8], ...segments, [0xff, 0xda], be16(4), [1, 2], 'SCANDATA', [0xff, 0xd9])

describe('stripMetadata', () => {
  it('drops EXIF, XMP and comments from JPEG but keeps the picture and its colours', () => {
    const icc = segment(0xe2, bytes('ICC_PROFILE', [0], 'colours'))
    const original = jpeg(
      segment(0xe0, bytes('JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
      segment(0xe1, exif(1)),
      segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/', [0], '<gps>55.7</gps>')),
      segment(0xfe, bytes('taken at home')),
      icc,
    )

    const stripped = stripMetadata(original, 'image/jpeg')

    expect(stripped).not.toBeNull()
    expect(contains(stripped as Uint8Array, 'GPS-SECRET')).toBe(false)
    expect(contains(stripped as Uint8Array, '<gps>')).toBe(false)
    expect(contains(stripped as Uint8Array, 'taken at home')).toBe(false)
    expect(contains(stripped as Uint8Array, 'colours')).toBe(true)
    expect(contains(stripped as Uint8Array, 'SCANDATA')).toBe(true)
  })

  it('keeps a JPEG upright: the orientation survives in a minimal EXIF', () => {
    const original = jpeg(segment(0xe1, exif(6)))
    expect(readJpegOrientation(original)).toBe(6)

    const stripped = stripMetadata(original, 'image/jpeg') as Uint8Array

    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(readJpegOrientation(stripped)).toBe(6)
  })

  it('leaves files without metadata alone', () => {
    expect(stripMetadata(jpeg(), 'image/jpeg')).toBeNull()
  })

  it('drops eXIf and text chunks from PNG', () => {
    const chunk = (type: string, data: Uint8Array) =>
      bytes(be32(data.length), type, data, [0, 0, 0, 0])
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      chunk('IHDR', bytes(be32(1), be32(1), [8, 6, 0, 0, 0])),
      chunk('eXIf', exif(1).subarray(6)),
      chunk('tEXt', bytes('Comment', [0], 'my flat')),
      chunk('IDAT', bytes('PIXELS')),
      chunk('IEND', bytes()),
    )

    const stripped = stripMetadata(png, 'image/png') as Uint8Array

    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(contains(stripped, 'my flat')).toBe(false)
    expect(contains(stripped, 'PIXELS')).toBe(true)
    expect(contains(stripped, 'IEND')).toBe(true)
  })

  it('drops EXIF and XMP chunks from WebP and fixes its headers', () => {
    const chunk = (fourcc: string, data: Uint8Array) =>
      bytes(fourcc, le32(data.length), data, data.length % 2 ? [0] : [])
    const body = bytes(
      'WEBP',
      chunk('VP8X', bytes([0x08 | 0x04 | 0x10, 0, 0, 0], [0, 0, 0], [0, 0, 0])),
      chunk('VP8L', bytes('PIXELS!')),
      chunk('EXIF', exif(1)),
      chunk('XMP ', bytes('<gps/>')),
    )
    const webp = bytes('RIFF', le32(body.length), body)

    const stripped = stripMetadata(webp, 'image/webp') as Uint8Array

    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(contains(stripped, '<gps/>')).toBe(false)
    expect(contains(stripped, 'PIXELS!')).toBe(true)
    const view = new DataView(stripped.buffer, stripped.byteOffset)
    expect(view.getUint32(4, true)).toBe(stripped.length - 8)
    // VP8X flags: alpha stays, EXIF and XMP are cleared.
    expect(stripped[20]).toBe(0x10)
  })

  it('leaves formats it does not know untouched', () => {
    expect(stripMetadata(bytes('BM', 'whatever'), 'image/bmp')).toBeNull()
  })

  it('reads past JPEG fill bytes and length-less markers', () => {
    const original = bytes(
      [0xff, 0xd8],
      [0xff, 0xff],
      segment(0xe1, exif(1)),
      [0xff, 0xd0],
      [0xff, 0xda],
      be16(4),
      [1, 2],
      'SCANDATA',
      [0xff, 0xd9],
    )
    const stripped = stripMetadata(original, 'image/jpeg') as Uint8Array
    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(contains(stripped, 'SCANDATA')).toBe(true)
  })

  it('cuts whatever follows the JPEG image, such as a second picture with its own EXIF', () => {
    const original = bytes(jpeg(), [0xff, 0xd8], segment(0xe1, exif(1)), [0xff, 0xd9])
    const stripped = stripMetadata(original, 'image/jpeg') as Uint8Array
    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(stripped.at(-2)).toBe(0xff)
    expect(stripped.at(-1)).toBe(0xd9)
  })

  it('refuses a JPEG it cannot read instead of passing it through', () => {
    const broken = bytes([0xff, 0xd8], [0xff, 0xe1], be16(4000), 'short')
    expect(() => stripMetadata(broken, 'image/jpeg')).toThrow(UnreadableImage)
  })

  it('drops bytes hidden after the end of a PNG', () => {
    const chunk = (type: string, data: Uint8Array) =>
      bytes(be32(data.length), type, data, [0, 0, 0, 0])
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      chunk('IHDR', bytes(be32(1), be32(1), [8, 6, 0, 0, 0])),
      chunk('IDAT', bytes('PIXELS')),
      chunk('IEND', bytes()),
      'GPS-SECRET',
    )
    const stripped = stripMetadata(png, 'image/png') as Uint8Array
    expect(contains(stripped, 'GPS-SECRET')).toBe(false)
    expect(contains(stripped, 'PIXELS')).toBe(true)
  })

  it('drops GIF comments and application data but keeps the animation loop', () => {
    const subBlocks = (text: string) => bytes([text.length], text, [0])
    const gif = bytes(
      'GIF89a',
      [1, 0, 1, 0, 0, 0, 0],
      [0x21, 0xfe],
      subBlocks('my flat'),
      [0x21, 0xff, 11],
      'XMP DataXMP',
      subBlocks('<gps/>'),
      [0x21, 0xff, 11],
      'NETSCAPE2.0',
      bytes([3, 1, 0, 0], [0]),
      [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0],
      [2],
      subBlocks('PX'),
      [0x3b],
    )
    const stripped = stripMetadata(gif, 'image/gif') as Uint8Array
    expect(contains(stripped, 'my flat')).toBe(false)
    expect(contains(stripped, '<gps/>')).toBe(false)
    expect(contains(stripped, 'NETSCAPE2.0')).toBe(true)
    expect(contains(stripped, 'PX')).toBe(true)
    expect(stripped.at(-1)).toBe(0x3b)
  })
})

describe('stripMetadata on real files', () => {
  const photo = (format: 'jpeg' | 'png' | 'webp') =>
    sharp({ create: { width: 4, height: 2, channels: 3, background: '#c0ffee' } })
      .withExif({ IFD0: { Make: 'SecretCam' }, IFD3: { GPSLatitudeRef: 'N' } })
      .withMetadata({ orientation: 6 })
      .toFormat(format)
      .toBuffer()

  it.each(['jpeg', 'png', 'webp'] as const)(
    'keeps %s decodable, drops the camera and location',
    async (format) => {
      const original = new Uint8Array(await photo(format))
      expect(contains(original, 'SecretCam')).toBe(true)

      const stripped = stripMetadata(original, `image/${format}`) as Uint8Array

      expect(contains(stripped, 'SecretCam')).toBe(false)
      const meta = await sharp(stripped).metadata()
      expect(meta.width).toBe(4)
      if (format === 'jpeg') expect(meta.orientation).toBe(6)
    },
  )
})
