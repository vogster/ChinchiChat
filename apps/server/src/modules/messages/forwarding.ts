import { Permission, decodeSnowflake } from '@chinchi/shared'

import { HttpError, badRequest } from '../../http/http-error'
import { isMessageChannel } from '../channels/channel.repository'

import type { AttachmentRepository, AttachmentRow } from '../attachments/attachment.repository'
import type { ChannelService } from '../channels/channel.service'
import type { MessageRepository, MessageRow } from './message.repository'
import type { Snowflake } from '@chinchi/shared'

export type ForwardColumn = NonNullable<MessageRow['forward']>

export interface ForwardSource {
  readonly messageId: Snowflake
  readonly column: ForwardColumn
  readonly files: readonly AttachmentRow[]
}

const unknownMessage = () => new HttpError(404, 'UNKNOWN_MESSAGE', 'Unknown message')

export const encryptedForward = () =>
  badRequest('ENCRYPTED_CHANNEL', "Encrypted conversations can't be forwarded from or to")

/**
 * The original of a forward, as the forwarder may see it: a message they can read, in a
 * conversation the server can read (encrypted ones stay where they are).
 */
export const createForwarding = ({
  channels,
  messages,
  attachmentRows,
}: {
  channels: Pick<ChannelService, 'resolve'>
  messages: Pick<MessageRepository, 'findInChannel'>
  attachmentRows: Pick<AttachmentRepository, 'listByMessages'>
}) => ({
  async source(
    channelId: Snowflake,
    messageId: Snowflake,
    userId: Snowflake,
  ): Promise<ForwardSource> {
    const { channel } = await channels.resolve(channelId, userId, Permission.ReadMessageHistory)
    if (!isMessageChannel(channel.type)) throw unknownMessage()
    if (channel.encrypted) throw encryptedForward()
    const found = await messages.findInChannel(channel.id, messageId)
    if (!found || found.message.system) throw unknownMessage()
    const original = found.message
    return {
      messageId: original.id,
      files: await attachmentRows.listByMessages([original.id]),
      column: {
        channelId: channel.id,
        guildId: channel.guildId,
        messageId: original.id,
        authorId: original.authorId,
        // A forward of a forward carries the original text on.
        content:
          original.forward && !original.content ? original.forward.content : original.content,
        createdAt: new Date(decodeSnowflake(original.id).timestamp).toISOString(),
      },
    }
  },
})

export type Forwarding = ReturnType<typeof createForwarding>
