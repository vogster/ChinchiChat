import { createHash, randomBytes } from 'node:crypto'
import { isInlineImage } from '@chinchi/shared'
import { detectImageType } from '@chinchi/shared'

import { createPreview } from '../../storage/thumbnail'
import { decodeHtml, parseOpenGraph } from './open-graph'

import type { SafeFetcher } from '../../net/safe-fetch'
import type { ObjectStorage } from '../../storage/object-storage'
import type { Embed } from '@chinchi/shared'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

/** Width of stored preview images (cards are small). */
export const EMBED_IMAGE_SIDE = 400
const CACHE_TTL_S = 6 * 60 * 60
/** A page that gave nothing is retried sooner. */
const MISS_TTL_S = 60 * 60

export interface LinkUnfurlerDeps {
  /** Fetches pages (text/html only). */
  readonly fetchPage: SafeFetcher
  /** Fetches images (image/* only). */
  readonly fetchImage: SafeFetcher
  /** Without storage, previews have no image. */
  readonly storage: ObjectStorage | undefined
  readonly redis: Redis | undefined
  readonly log: FastifyBaseLogger
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * Object key and public API path of a stored preview image. The id is random, never derived
 * from the image URL: otherwise anyone could test whether some page was linked here.
 */
export const embedImageKey = (id: string) => `embeds/${id}.webp`
export const embedImageUrl = (id: string) => `/api/v1/embeds/${id}.webp`

/** Images are decoded in the background, but a burst of them still adds up. */
const EMBED_IMAGE_MAX_PIXELS = 16_000_000

/** Turns a URL into a preview card: page metadata plus a small image stored on the instance. */
export const createLinkUnfurler = ({
  fetchPage,
  fetchImage,
  storage,
  redis,
  log,
}: LinkUnfurlerDeps) => {
  /** Stored once per cached page, then shared by every message linking to that page. */
  const storeImage = async (imageUrl: string): Promise<Embed['image']> => {
    if (!storage) return null
    const fetched = await fetchImage(imageUrl)
    if (!fetched) return null
    const type = detectImageType(fetched.body)
    if (!type || !isInlineImage(type)) return null
    const preview = await createPreview(fetched.body, {
      maxSide: EMBED_IMAGE_SIDE,
      maxPixels: EMBED_IMAGE_MAX_PIXELS,
    })
    const id = randomBytes(16).toString('hex')
    await storage.put(embedImageKey(id), preview.preview, 'image/webp')
    return { url: embedImageUrl(id), width: preview.previewWidth, height: preview.previewHeight }
  }

  const build = async (url: string): Promise<Embed | null> => {
    const page = await fetchPage(url)
    if (!page) return null
    const graph = parseOpenGraph(decodeHtml(page.body, page.contentType), page.url)
    if (!graph) return null
    let image: Embed['image'] = null
    if (graph.imageUrl) {
      try {
        image = await storeImage(graph.imageUrl)
      } catch (error) {
        log.debug({ err: error }, 'Link preview image failed')
      }
    }
    return {
      url,
      title: graph.title,
      description: graph.description,
      siteName: graph.siteName,
      image,
    }
  }

  const unfurlUncached = async (url: string): Promise<Embed | null> => {
    const key = `chinchi:unfurl:${sha256(url)}`
    const cached = redis ? await redis.get(key) : null
    if (cached !== null) return JSON.parse(cached) as Embed | null
    const embed = await build(url)
    await redis?.set(key, JSON.stringify(embed), 'EX', embed ? CACHE_TTL_S : MISS_TTL_S)
    return embed
  }

  // The same URL sent many times at once is fetched once.
  const inFlight = new Map<string, Promise<Embed | null>>()

  return (url: string): Promise<Embed | null> => {
    const running = inFlight.get(url)
    if (running) return running
    const started = unfurlUncached(url).finally(() => inFlight.delete(url))
    inFlight.set(url, started)
    return started
  }
}

export type LinkUnfurler = ReturnType<typeof createLinkUnfurler>
