import { guildTopic, userTopic } from '../../events/event-bus'

import type { EventBus } from '../../events/event-bus'
import type { AnyChannelRow } from './channel.repository'
import type { DispatchType, Snowflake } from '@chinchi/shared'

export interface ChannelEventsDeps {
  readonly events: EventBus
  readonly recipientIds: (channelId: Snowflake) => Promise<Snowflake[]>
  /** Runs before a new DM message goes out (members who hid the DM get it back first). */
  readonly beforeDmMessage?: (channelId: Snowflake) => Promise<void>
}

/**
 * Publishes an event about a channel to whoever may see it: the server's topic for server
 * channels (the gateway filters by permissions), each member's own topic for DMs.
 */
export const createChannelEvents = ({
  events,
  recipientIds,
  beforeDmMessage,
}: ChannelEventsDeps) => ({
  async publish(
    channel: Pick<AnyChannelRow, 'id' | 'guildId'>,
    type: DispatchType,
    data: unknown,
  ): Promise<void> {
    if (channel.guildId) {
      await events.publish({ topic: guildTopic(channel.guildId), type, data })
      return
    }
    if (type === 'MESSAGE_CREATE') await beforeDmMessage?.(channel.id)
    const members = await recipientIds(channel.id)
    await Promise.all(
      members.map((userId) => events.publish({ topic: userTopic(userId), type, data })),
    )
  },
})

export type ChannelEvents = ReturnType<typeof createChannelEvents>
