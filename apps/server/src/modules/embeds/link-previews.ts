import { parseMarkdown } from '@chinchi/markdown'
import { LINK_PREVIEWS_PER_MESSAGE } from '@chinchi/shared'

import type { ChannelEvents } from '../channels/channel-events'
import type { ChannelRepository } from '../channels/channel.repository'
import type { MessageViews } from '../messages/message-views'
import type { MessageRepository } from '../messages/message.repository'
import type { LinkUnfurler } from './link-unfurler'
import type { InlineNode, MarkdownDocument } from '@chinchi/markdown'
import type { Embed as MessageEmbed, Snowflake } from '@chinchi/shared'

/** The links in a message that get a preview: http(s), not `<suppressed>`, first few only. */
export const previewLinks = (content: string): string[] => {
  const links = new Set<string>()
  const visit = (nodes: readonly InlineNode[]) => {
    for (const node of nodes) {
      if (node.type === 'link' && !node.suppressEmbed) links.add(node.url)
      if ('children' in node) visit(node.children)
    }
  }
  const walk = (doc: MarkdownDocument) => {
    for (const block of doc) {
      if (block.type === 'paragraph') visit(block.children)
      if (block.type === 'quote') walk(block.children)
    }
  }
  walk(parseMarkdown(content))
  return [...links].slice(0, LINK_PREVIEWS_PER_MESSAGE)
}

const sameLinks = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((link, index) => link === b[index])

export interface LinkPreviewsDeps {
  readonly unfurl: LinkUnfurler
  readonly messages: MessageRepository
  readonly channelRows: ChannelRepository
  readonly views: MessageViews
  readonly channelEvents: ChannelEvents
  readonly concurrency?: number
  /** Queued previews beyond this are dropped (a flood of links must not grow memory). */
  readonly maxQueued?: number
}

/**
 * Background link previews. Work runs in this process with bounded concurrency (a restart
 * drops queued previews: they are a nicety, not data). Results are announced with
 * MESSAGE_UPDATE, unless the message was edited to other links or deleted meanwhile.
 */
export const createLinkPreviews = ({
  unfurl,
  messages,
  channelRows,
  views,
  channelEvents,
  concurrency = 2,
  maxQueued = 500,
}: LinkPreviewsDeps) => {
  const queue: (() => Promise<void>)[] = []
  const running = new Set<Promise<void>>()

  const pump = () => {
    while (running.size < concurrency && queue.length > 0) {
      const task = queue.shift() as () => Promise<void>
      const run: Promise<void> = task()
        .catch(() => undefined)
        .finally(() => {
          running.delete(run)
          pump()
        })
      running.add(run)
    }
  }

  const preview = async (channelId: Snowflake, messageId: Snowflake, links: readonly string[]) => {
    // One link at a time: bounds memory and outgoing requests per task.
    const embeds: MessageEmbed[] = []
    for (const link of links) {
      const embed = await unfurl(link)
      if (embed) embeds.push(embed)
    }
    const found = await messages.findInChannel(channelId, messageId)
    // Edited to other links (or deleted) while we were fetching: those results are stale.
    if (!found || !sameLinks(previewLinks(found.message.content), links)) return
    if (embeds.length === 0 && found.message.embeds.length === 0) return
    const row = await messages.setEmbeds(messageId, embeds)
    const channel = await channelRows.findById(channelId)
    if (!row || !channel) return
    await channelEvents.publish(
      channel,
      'MESSAGE_UPDATE',
      await views.one(channelId, channel.guildId, { message: row, author: found.author }),
    )
  }

  return {
    /** Queues previews for the links in this content (nothing if it has none). */
    schedule(channelId: Snowflake, messageId: Snowflake, content: string) {
      const links = previewLinks(content)
      if (links.length === 0 || queue.length >= maxQueued) return
      queue.push(() => preview(channelId, messageId, links))
      pump()
    },

    /** Resolves once nothing is queued or running (tests). */
    async idle() {
      while (running.size > 0 || queue.length > 0) await Promise.all([...running])
    },

    /** Shutdown: drops what is queued and waits only for what is already running. */
    async close() {
      queue.length = 0
      await Promise.all([...running])
    },
  }
}

export type LinkPreviews = ReturnType<typeof createLinkPreviews>
