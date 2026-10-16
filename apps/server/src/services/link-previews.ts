import { createLinkPreviews } from '../modules/embeds/link-previews'
import { createLinkUnfurler } from '../modules/embeds/link-unfurler'
import { createSafeFetcher } from '../net/safe-fetch'

import type { ChannelEvents } from '../modules/channels/channel-events'
import type { ChannelRepository } from '../modules/channels/channel.repository'
import type { MessageViews } from '../modules/messages/message-views'
import type { MessageRepository } from '../modules/messages/message.repository'
import type { SafeFetchOptions } from '../net/safe-fetch'
import type { ObjectStorage } from '../storage/object-storage'
import type { FastifyBaseLogger } from 'fastify'
import type { Redis } from 'ioredis'

export interface LinkPreviewDeps {
  readonly storage: ObjectStorage | undefined
  readonly redis: Redis | undefined
  readonly log: FastifyBaseLogger
  /** Tests only: lets link previews reach a local test site. */
  readonly fetchOverrides?: Pick<SafeFetchOptions, 'isAllowedAddress' | 'isAllowedPort'>
  readonly messages: MessageRepository
  readonly channelRows: ChannelRepository
  readonly views: MessageViews
  readonly channelEvents: ChannelEvents
}

/**
 * Previews of links in messages, fetched through the SSRF-safe fetcher: pages as HTML, their
 * images up to 4 MB with one redirect.
 */
export const createLinkPreviewServices = ({
  storage,
  redis,
  log,
  fetchOverrides,
  messages,
  channelRows,
  views,
  channelEvents,
}: LinkPreviewDeps) =>
  createLinkPreviews({
    unfurl: createLinkUnfurler({
      fetchPage: createSafeFetcher({
        accept: (type) => type.startsWith('text/html'),
        ...fetchOverrides,
      }),
      fetchImage: createSafeFetcher({
        accept: (type) => type.startsWith('image/'),
        maxBytes: 4 * 1024 * 1024,
        maxRedirects: 1,
        ...fetchOverrides,
      }),
      storage,
      redis,
      log,
    }),
    messages,
    channelRows,
    views,
    channelEvents,
  })
