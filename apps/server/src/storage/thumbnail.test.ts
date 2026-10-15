import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  PREVIEW_MAX_SIDE,
  PROFILE_IMAGE_SIDE,
  createPreview,
  createProfileImage,
} from './thumbnail'

import type { Sharp } from 'sharp'

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })

const bytes = async (image: Sharp) => new Uint8Array(await image.toBuffer())

describe('createPreview', () => {
  it('reports the original size and shrinks into a WebP preview', async () => {
    const result = await createPreview(await bytes(solid(2000, 1000).png()))

    expect(result).toMatchObject({ width: 2000, height: 1000 })
    const preview = await sharp(result.preview).metadata()
    expect(preview).toMatchObject({ format: 'webp', width: PREVIEW_MAX_SIDE, height: 400 })
  })

  it('never enlarges small images', async () => {
    const result = await createPreview(await bytes(solid(120, 60).jpeg()))
    expect(await sharp(result.preview).metadata()).toMatchObject({ width: 120, height: 60 })
  })

  it('applies EXIF orientation and drops metadata', async () => {
    // Stored landscape, but the camera says "rotate 90°": people see a portrait photo.
    const rotated = await bytes(solid(200, 100).jpeg().withMetadata({ orientation: 6 }))

    const result = await createPreview(rotated)

    expect(result).toMatchObject({ width: 100, height: 200 })
    const preview = await sharp(result.preview).metadata()
    expect(preview).toMatchObject({ width: 100, height: 200 })
    expect(preview.exif).toBeUndefined()
    expect(preview.orientation).toBeUndefined()
  })

  it('uses the first frame of an animation', async () => {
    const frames = await bytes(
      sharp({
        create: { width: 40, height: 30, channels: 4, background: '#0f0' },
      }).gif(),
    )
    const result = await createPreview(frames)
    expect(result).toMatchObject({ width: 40, height: 30 })
    expect((await sharp(result.preview).metadata()).pages ?? 1).toBe(1)
  })

  it('refuses images with too many pixels (decompression bombs)', async () => {
    const big = await bytes(solid(400, 400).png())
    await expect(createPreview(big, { maxPixels: 100 * 100 })).rejects.toThrow()
  })

  it('refuses data that is not an image', async () => {
    await expect(createPreview(new TextEncoder().encode('<svg/>'))).rejects.toThrow()
  })
})

describe('createProfileImage', () => {
  it('crops to a centered square WebP of the profile size', async () => {
    const image = await createProfileImage(await bytes(solid(1000, 500).png()))
    expect(await sharp(image).metadata()).toMatchObject({
      format: 'webp',
      width: PROFILE_IMAGE_SIDE,
      height: PROFILE_IMAGE_SIDE,
    })
  })

  it('never enlarges, but still makes small images square', async () => {
    const image = await createProfileImage(await bytes(solid(80, 40).jpeg()))
    expect(await sharp(image).metadata()).toMatchObject({ width: 40, height: 40 })
  })

  it('refuses what is not an allowed image', async () => {
    await expect(createProfileImage(new TextEncoder().encode('nope'))).rejects.toThrow()
  })
})
