import { userTopic } from '../../events/event-bus'
import { HttpError } from '../../http/http-error'
import { toPrivateChannel } from './dm.mapper'

import type { EventBus } from '../../events/event-bus'
import type { ReadStateRepository } from '../messages/read-state.repository'
import type { DmRepository } from './dm.repository'
import type { Snowflake } from '@chinchi/shared'

export interface DmVisibilityDeps {
  readonly dms: DmRepository
  readonly readStates: Pick<ReadStateRepository, 'advance'>
  readonly events: EventBus
}

const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')

/**
 * Hiding a DM from your own list ("close"): it stays a member's channel with its history, read
 * up to where it was hidden, and comes back with the next message or when opened again.
 */
export const createDmVisibility = ({ dms, readStates, events }: DmVisibilityDeps) => {
  /** Tells each of these members' clients that the channel is on their list again. */
  const announce = async (channelId: Snowflake, userIds: readonly Snowflake[]) => {
    if (userIds.length === 0) return
    const channel = await dms.findPrivate(channelId)
    if (!channel) return
    const members = (await dms.recipientsOf([channelId])).get(channelId) ?? []
    await Promise.all(
      userIds.map((userId) =>
        events.publish({
          topic: userTopic(userId),
          type: 'PRIVATE_CHANNEL_CREATE',
          data: toPrivateChannel(channel, members, userId),
        }),
      ),
    )
  }

  return {
    async hide(userId: Snowflake, channelId: Snowflake): Promise<void> {
      const through = await dms.hide(channelId, userId)
      if (through === null) throw unknownChannel()
      // A hidden conversation with unread messages would keep counting on the home button.
      if (through !== channelId) await readStates.advance(userId, channelId, through)
      await events.publish({
        topic: userTopic(userId),
        type: 'PRIVATE_CHANNEL_DELETE',
        data: { id: channelId },
      })
    },

    /** Before a new message goes out: everyone who hid the channel gets it back first. */
    async revealForMessage(channelId: Snowflake): Promise<void> {
      await announce(channelId, await dms.unhide(channelId))
    },

    /** Opening a DM you hid shows it again. */
    async reopen(channelId: Snowflake, userId: Snowflake): Promise<void> {
      await announce(channelId, await dms.unhide(channelId, userId))
    },
  }
}

export type DmVisibility = ReturnType<typeof createDmVisibility>
