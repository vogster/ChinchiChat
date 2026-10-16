/**
 * Removes metadata (EXIF with GPS, XMP, comments) from uploaded photos without re-encoding
 * them: whole blocks are cut out of the file, so the picture itself is untouched. Returns
 * null when there was nothing to remove (or the format isn't handled).
 */

const EXIF_HEADER = 'Exif\0\0'
const ORIENTATION_TAG = 0x0112

const latin1 = (data: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...data.subarray(start, start + length))

/** The bytes of a latin-1 string (format markers like `Exif` and `RIFF`). */
const latin1Bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))

const concat = (parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** EXIF orientation (1–8) from a TIFF block, or null. */
const tiffOrientation = (tiff: Uint8Array): number | null => {
  if (tiff.length < 8) return null
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.length)
  const order = latin1(tiff, 0, 2)
  if (order !== 'II' && order !== 'MM') return null
  const little = order === 'II'
  const ifd = view.getUint32(4, little)
  if (ifd + 2 > tiff.length) return null
  const entries = view.getUint16(ifd, little)
  for (let i = 0; i < entries; i += 1) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > tiff.length) return null
    if (view.getUint16(entry, little) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

/** An APP1 segment whose EXIF holds only the orientation, so photos stay upright. */
const orientationSegment = (orientation: number) => {
  const tiff = Uint8Array.from([
    0x4d,
    0x4d,
    0,
    42,
    0,
    0,
    0,
    8, // big-endian header, IFD0 at 8
    0,
    1, // one entry
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0, // orientation: SHORT ×1
    0,
    0,
    0,
    0, // no next IFD
  ])
  const payload = concat([latin1Bytes(EXIF_HEADER), tiff])
  const length = payload.length + 2
  return concat([Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff]), payload])
}

interface JpegSegment {
  readonly marker: number
  readonly start: number
  readonly end: number
}

/** A photo whose structure doesn't parse: refused rather than passed on with its metadata. */
export class UnreadableImage extends Error {
  override readonly name = 'UnreadableImage'
}

const unreadable = (format: string): never => {
  throw new UnreadableImage(`Unreadable ${format}`)
}

/** Markers that stand alone, without a length: TEM and the restart markers RST0–7. */
const isStandalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)

/** Header segments up to the image data (SOS); null if this isn't a JPEG at all. */
const jpegSegments = (data: Uint8Array): { segments: JpegSegment[]; scan: number } | null => {
  if (data[0] !== 0xff || data[1] !== 0xd8) return null
  const segments: JpegSegment[] = []
  let offset = 2
  while (offset + 2 <= data.length) {
    if (data[offset] !== 0xff) return unreadable('JPEG')
    const marker = data[offset + 1] as number
    // Fill bytes: any number of 0xFF may come before a marker.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xda) return { segments, scan: offset }
    if (isStandalone(marker)) {
      offset += 2
      continue
    }
    if (offset + 4 > data.length) return unreadable('JPEG')
    const length = ((data[offset + 2] as number) << 8) | (data[offset + 3] as number)
    const end = offset + 2 + length
    if (length < 2 || end > data.length) return unreadable('JPEG')
    segments.push({ marker, start: offset, end })
    offset = end
  }
  return unreadable('JPEG')
}

/** Where the image ends (after EOI): anything later, such as a second picture, is dropped. */
const jpegEnd = (data: Uint8Array, scan: number) => {
  for (let i = scan + 2; i + 1 < data.length; i += 1) {
    // Inside scan data 0xFF is followed by 0x00 (stuffing) or a marker; only EOI ends it.
    if (data[i] === 0xff && data[i + 1] === 0xd9) return i + 2
  }
  return unreadable('JPEG')
}

const isExifSegment = (data: Uint8Array, segment: JpegSegment) =>
  segment.marker === 0xe1 &&
  segment.end - segment.start > 10 &&
  latin1(data, segment.start + 4, EXIF_HEADER.length) === EXIF_HEADER

export const readJpegOrientation = (data: Uint8Array): number | null => {
  const parsed = jpegSegments(data)
  const exif = parsed?.segments.find((segment) => isExifSegment(data, segment))
  return exif ? tiffOrientation(data.subarray(exif.start + 4 + EXIF_HEADER.length, exif.end)) : null
}

/** APP1 (EXIF, XMP), APP13 (Photoshop/IPTC) and comments go; JFIF, ICC and Adobe stay. */
const DROPPED_JPEG = new Set([0xe1, 0xed, 0xfe])

const stripJpeg = (data: Uint8Array): Uint8Array | null => {
  const parsed = jpegSegments(data)
  if (!parsed) return null
  const end = jpegEnd(data, parsed.scan)
  const dropping = parsed.segments.some((s) => DROPPED_JPEG.has(s.marker))
  if (!dropping && end === data.length) return null
  const orientation = readJpegOrientation(data)
  const kept = parsed.segments.filter((s) => !DROPPED_JPEG.has(s.marker))
  // Right after JFIF (APP0) if there is one, as EXIF readers expect.
  const at = kept[0]?.marker === 0xe0 ? 1 : 0
  const parts = kept.map((s) => data.subarray(s.start, s.end))
  if (orientation && orientation !== 1) parts.splice(at, 0, orientationSegment(orientation))
  return concat([data.subarray(0, 2), ...parts, data.subarray(parsed.scan, end)])
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const DROPPED_PNG = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME'])

const stripPng = (data: Uint8Array): Uint8Array | null => {
  if (!PNG_SIGNATURE.every((byte, i) => data[i] === byte)) return null
  const view = new DataView(data.buffer, data.byteOffset, data.length)
  const parts: Uint8Array[] = [data.subarray(0, 8)]
  let dropped = false
  let ended = false
  let offset = 8
  while (offset + 12 <= data.length) {
    const end = offset + 12 + view.getUint32(offset)
    if (end > data.length) return unreadable('PNG')
    const type = latin1(data, offset + 4, 4)
    if (DROPPED_PNG.has(type)) dropped = true
    else parts.push(data.subarray(offset, end))
    offset = end
    if (type === 'IEND') {
      ended = true
      break
    }
  }
  if (!ended) return unreadable('PNG')
  // Bytes hidden after IEND go too.
  return dropped || offset < data.length ? concat(parts) : null
}

const VP8X_EXIF = 0x08
const VP8X_XMP = 0x04

const stripWebp = (data: Uint8Array): Uint8Array | null => {
  if (data.length < 12 || latin1(data, 0, 4) !== 'RIFF' || latin1(data, 8, 4) !== 'WEBP') {
    return null
  }
  const view = new DataView(data.buffer, data.byteOffset, data.length)
  const chunks: Uint8Array[] = []
  let dropped = false
  let offset = 12
  while (offset + 8 <= data.length) {
    const size = view.getUint32(offset + 4, true)
    const end = offset + 8 + size + (size % 2)
    if (end > data.length) return unreadable('WebP')
    const fourcc = latin1(data, offset, 4)
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      dropped = true
    } else if (fourcc === 'VP8X') {
      const copy = data.slice(offset, end)
      copy[8] = (copy[8] as number) & ~(VP8X_EXIF | VP8X_XMP)
      chunks.push(copy)
    } else {
      chunks.push(data.subarray(offset, end))
    }
    offset = end
  }
  if (!dropped) return null
  const body = concat([latin1Bytes('WEBP'), ...chunks])
  const header = new Uint8Array(8)
  header.set(latin1Bytes('RIFF'))
  new DataView(header.buffer).setUint32(4, body.length, true)
  return concat([header, body])
}

/** Application extensions that only make animations loop; every other one is dropped. */
const GIF_KEPT_APPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0'])

/** Skips a run of GIF sub-blocks at `offset`; returns the offset after the terminator. */
const skipSubBlocks = (data: Uint8Array, offset: number) => {
  let at = offset
  while (at < data.length) {
    const size = data[at] as number
    at += 1 + size
    if (size === 0) return at
  }
  return unreadable('GIF')
}

const colourTable = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0)

const stripGif = (data: Uint8Array): Uint8Array | null => {
  if (data.length < 13 || latin1(data, 0, 3) !== 'GIF') return null
  // Header, screen descriptor and the global colour table, if any.
  let offset = 13 + colourTable(data[10] as number)
  if (offset > data.length) return unreadable('GIF')
  const parts: Uint8Array[] = [data.subarray(0, offset)]
  let dropped = false
  while (offset < data.length) {
    const introducer = data[offset] as number
    if (introducer === 0x3b) {
      parts.push(data.subarray(offset, offset + 1))
      return dropped || offset + 1 < data.length ? concat(parts) : null
    }
    if (introducer === 0x2c) {
      // Image descriptor, local colour table, LZW code size, then the image's sub-blocks.
      if (offset + 10 > data.length) return unreadable('GIF')
      const start = offset + 10 + colourTable(data[offset + 9] as number) + 1
      const end = skipSubBlocks(data, start)
      parts.push(data.subarray(offset, end))
      offset = end
      continue
    }
    if (introducer !== 0x21 || offset + 2 > data.length) return unreadable('GIF')
    const label = data[offset + 1] as number
    const end = skipSubBlocks(data, offset + 2)
    const app = label === 0xff && offset + 14 <= data.length ? latin1(data, offset + 3, 11) : ''
    const keep = label === 0xf9 || label === 0x01 || GIF_KEPT_APPS.has(app)
    if (keep) parts.push(data.subarray(offset, end))
    else dropped = true
    offset = end
  }
  return unreadable('GIF')
}

/** Throws `UnreadableImage` when a file of a handled format doesn't parse. */
export const stripMetadata = (data: Uint8Array, contentType: string): Uint8Array | null => {
  switch (contentType) {
    case 'image/jpeg':
      return stripJpeg(data)
    case 'image/png':
      return stripPng(data)
    case 'image/webp':
      return stripWebp(data)
    case 'image/gif':
      return stripGif(data)
    default:
      return null
  }
}
