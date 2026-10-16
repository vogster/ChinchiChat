import { stripMetadata } from '@chinchi/shared'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

/** The pure cases live with the code in @chinchi/shared; here, real files made by sharp. */
const contains = (haystack: Uint8Array, needle: string) =>
  Buffer.from(haystack).includes(Buffer.from(needle, 'latin1'))

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
