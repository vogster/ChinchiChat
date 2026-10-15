import type { InlineImageType } from './attachment.schemas'

/** How many leading bytes `detectImageType` needs. */
export const SNIFF_BYTES = 16

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

const startsWith = (data: Uint8Array, signature: readonly number[], offset = 0) =>
  data.length >= offset + signature.length &&
  signature.every((byte, index) => data[offset + index] === byte)

const PNG = [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const GIF87 = ascii('GIF87a')
const GIF89 = ascii('GIF89a')
const RIFF = ascii('RIFF')
const WEBP = ascii('WEBP')

/**
 * The image format by its magic bytes. The client-declared content type is not trusted for
 * anything a browser would render inline.
 */
export const detectImageType = (data: Uint8Array): InlineImageType | null => {
  if (startsWith(data, PNG)) return 'image/png'
  if (startsWith(data, JPEG)) return 'image/jpeg'
  if (startsWith(data, GIF87) || startsWith(data, GIF89)) return 'image/gif'
  if (startsWith(data, RIFF) && startsWith(data, WEBP, 8)) return 'image/webp'
  return null
}
