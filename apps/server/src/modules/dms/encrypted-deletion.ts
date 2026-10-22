import { userTopic } from '../../events/event-bus'
import { forbidden, HttpError } from '../../http/http-error'

import type { EventBus } from '../../events/event-bus'
import type { UserRow } from '../users/user.repository'
import type { DmRepository } from './dm.repository'
import type { Snowflake } from '@chinchi/shared'

export interface EncryptedDeletionDeps {
  readonly dms: Pick<DmRepository, 'findPrivate' | 'deleteEncrypted'>
  readonly events: EventBus
}

const unknownChannel = () => new HttpError(404, 'UNKNOWN_CHANNEL', 'Unknown channel')

/**
 * Deleting an encrypted conversation for everyone in it: its messages, files and encryption
 * state go (the database cascades; storage cleanup takes the files), and every member's
 * clients drop it and forget its keys. Either person in a 1:1 may do it, in a group only the
 * owner. Plain conversations are not deleted: they are hidden, as before.
 */
export const createEncryptedDeletion = ({ dms, events }: EncryptedDeletionDeps) => ({
  /** False when the channel is not a private one (a server's channel is deleted elsewhere). */
  async delete(me: UserRow, channelId: Snowflake): Promise<boolean> {
    if (!(await dms.findPrivate(channelId))) return false
    const outcome = await dms.deleteEncrypted(channelId, me.id)
    if (outcome.result === 'not_member') throw unknownChannel()
    if (outcome.result === 'not_encrypted') {
      throw forbidden('NOT_ENCRYPTED', 'Only encrypted conversations can be deleted')
    }
    if (outcome.result !== 'deleted') {
      throw forbidden('MISSING_PERMISSIONS', 'Only the owner can delete the group')
    }
    // PRIVATE_CHANNEL_DELETE also ends a call in it (see voice-guard.ts).
    await Promise.all(
      outcome.memberIds.map((userId) =>
        events.publish({
          topic: userTopic(userId),
          type: 'PRIVATE_CHANNEL_DELETE',
          data: { id: channelId, deleted: true },
        }),
      ),
    )
    return true
  },
})

export type EncryptedDeletion = ReturnType<typeof createEncryptedDeletion>
