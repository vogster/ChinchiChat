import sharp from 'sharp'

// Previews are one-off: libvips' operation cache would only hold memory.
sharp.cache(false)

/** Longest side of a preview, in pixels. */
export const PREVIEW_MAX_SIDE = 800
/** Refuse larger images: decoding cost grows with pixels, not bytes (decompression bombs). */
export const MAX_INPUT_PIXELS = 30_000_000

/** Only raster formats that passed the upload's magic-byte check; never SVG or exotic decoders. */
const ALLOWED_FORMATS = new Set(['png', 'jpeg', 'gif', 'webp'])

export interface Preview {
  /** Size of the original as people see it (EXIF orientation applied). */
  readonly width: number
  readonly height: number
  /** WebP, at most PREVIEW_MAX_SIDE on each side, without metadata. */
  readonly preview: Uint8Array
  readonly previewWidth: number
  readonly previewHeight: number
}

export interface PreviewOptions {
  readonly maxPixels?: number
  /** Longest side of the preview (default PREVIEW_MAX_SIDE). */
  readonly maxSide?: number
}

/** Side of the square avatars and server icons are stored at. */
export const PROFILE_IMAGE_SIDE = 256

/** Opens an allowed raster image (first frame only: animations become stills). */
const open = async (input: Uint8Array, maxPixels: number) => {
  const image = sharp(input, { limitInputPixels: maxPixels, pages: 1, failOn: 'error' })
  const metadata = await image.metadata()
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error('Unsupported image format')
  }
  return { image, metadata }
}

export const createPreview = async (
  input: Uint8Array,
  { maxPixels = MAX_INPUT_PIXELS, maxSide = PREVIEW_MAX_SIDE }: PreviewOptions = {},
): Promise<Preview> => {
  const { image, metadata } = await open(input, maxPixels)
  const { width, height } = metadata.autoOrient

  const { data, info } = await image
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true })

  return {
    width,
    height,
    preview: new Uint8Array(data),
    previewWidth: info.width,
    previewHeight: info.height,
  }
}

/** Avatars and icons are decoded inside the request: keep their inputs smaller. */
export const PROFILE_MAX_INPUT_PIXELS = 16_000_000

/** A centered square crop for avatars and server icons, without metadata. */
export const createProfileImage = async (
  input: Uint8Array,
  { maxPixels = PROFILE_MAX_INPUT_PIXELS }: PreviewOptions = {},
): Promise<Uint8Array> => {
  const { image, metadata } = await open(input, maxPixels)
  const side = Math.min(PROFILE_IMAGE_SIDE, metadata.autoOrient.width, metadata.autoOrient.height)
  const output = await image
    .rotate()
    .resize({ width: side, height: side, fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toBuffer()
  return new Uint8Array(output)
}

/** Profile banners: a 3:1 strip, wide enough for the profile card on any screen. */
export const BANNER_WIDTH = 960
export const BANNER_HEIGHT = 320

export const createBannerImage = async (input: Uint8Array): Promise<Uint8Array> => {
  const { image } = await open(input, PROFILE_MAX_INPUT_PIXELS)
  const output = await image
    .rotate()
    .resize({ width: BANNER_WIDTH, height: BANNER_HEIGHT, fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toBuffer()
  return new Uint8Array(output)
}

/** Side of a server emoji image. */
export const EMOJI_IMAGE_SIDE = 128

/**
 * A server emoji: the whole picture fitted into a transparent 128px square (never cropped),
 * WebP. First frame only for animations.
 */
export const createEmojiImage = async (input: Uint8Array): Promise<Uint8Array> => {
  const { image } = await open(input, PROFILE_MAX_INPUT_PIXELS)
  const output = await image
    .rotate()
    .resize({
      width: EMOJI_IMAGE_SIDE,
      height: EMOJI_IMAGE_SIDE,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 90 })
    .toBuffer()
  return new Uint8Array(output)
}
