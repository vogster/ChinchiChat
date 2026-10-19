import { userTopic } from '../../events/event-bus'
import { badRequest, HttpError } from '../../http/http-error'
import { toPublicUser } from '../users/user.mapper'
import { createMemoryFriendCooldown } from './friend-cooldown'
import { createRelationshipRepository } from './relationship.repository'

import type { Database } from '../../db/client'
import type { EventBus } from '../../events/event-bus'
import type { PresenceLookup } from '../invites/invite.service'
import type { UserRepository, UserRow } from '../users/user.repository'
import type { FriendCooldown } from './friend-cooldown'
import type { RelationshipRepository, RelationshipRow } from './relationship.repository'
import type { Relationship, Snowflake } from '@chinchi/shared'

export interface RelationshipServiceDeps {
  readonly db: Database
  readonly relationships: RelationshipRepository
  readonly users: UserRepository
  readonly events: EventBus
  readonly presence?: PresenceLookup | undefined
  /** Whether two users share a server (then they keep seeing each other's status). */
  readonly sharesGuild?: (a: Snowflake, b: Snowflake) => Promise<boolean>
  /** Holds back a new request to someone who just declined one. */
  readonly cooldown?: FriendCooldown
}

/** One message for every refused request: it must not tell who exists or who blocked you. */
const requestFailed = () =>
  badRequest('FRIEND_REQUEST_FAILED', 'Could not send a friend request to this user')
const unknownUser = () => new HttpError(404, 'UNKNOWN_USER', 'Unknown user')
const coolingDown = () =>
  new HttpError(429, 'FRIEND_REQUEST_COOLDOWN', 'This user declined your request recently')

export const toRelationship = (row: RelationshipRow, user: UserRow): Relationship => ({
  user: toPublicUser(user),
  type: row.type,
  since: row.createdAt.toISOString(),
})

/** Friends, requests and blocks. Pair changes run in one transaction; both sides are told. */
export const createRelationshipService = ({
  db,
  relationships,
  users,
  events,
  presence,
  sharesGuild = async () => false,
  cooldown = createMemoryFriendCooldown(),
}: RelationshipServiceDeps) => {
  /** An ended friendship stops sharing status, unless a server still does. */
  const hidePresence = async (a: Snowflake, b: Snowflake) => {
    if (await sharesGuild(a, b)) return
    await Promise.all([
      events.publish({
        topic: userTopic(b),
        type: 'PRESENCE_UPDATE',
        data: { userId: a, status: 'offline' },
      }),
      events.publish({
        topic: userTopic(a),
        type: 'PRESENCE_UPDATE',
        data: { userId: b, status: 'offline' },
      }),
    ])
  }

  /** Friends see each other's status, so a new friendship shares the current one. */
  const sharePresence = async (a: Snowflake, b: Snowflake) => {
    const statuses = (await presence?.visible([a, b])) ?? []
    await Promise.all(
      statuses.map((status) =>
        events.publish({
          topic: userTopic(status.userId === a ? b : a),
          type: 'PRESENCE_UPDATE',
          data: status,
        }),
      ),
    )
  }

  const announce = async (row: RelationshipRow, target: UserRow) =>
    events.publish({
      topic: userTopic(row.userId),
      type: 'RELATIONSHIP_ADD',
      data: toRelationship(row, target),
    })

  const announceRemoval = (userId: Snowflake, targetId: Snowflake) =>
    events.publish({
      topic: userTopic(userId),
      type: 'RELATIONSHIP_REMOVE',
      data: { userId: targetId },
    })

  /** Runs `work` with both rows of the pair locked against concurrent changes. */
  const withPair = <T>(
    a: Snowflake,
    b: Snowflake,
    work: (repo: RelationshipRepository) => Promise<T>,
  ): Promise<T> =>
    db.transaction(async (tx) => {
      const repo = createRelationshipRepository(tx)
      await repo.lockPair(a, b)
      return work(repo)
    })

  /** Asks (or accepts, if they already asked). Refusals all look alike to the asker. */
  const befriend = async (me: UserRow, them: UserRow): Promise<Relationship> => {
    const change = await withPair(me.id, them.id, async (repo) => {
      const [mine, theirs] = await Promise.all([
        repo.find(me.id, them.id),
        repo.find(them.id, me.id),
      ])
      if (mine?.type === 'blocked') {
        throw badRequest('USER_BLOCKED', 'Unblock this user before sending a friend request')
      }
      if (theirs?.type === 'blocked') throw requestFailed()
      // A fresh request (not accepting theirs) waits out a recent decline. The asker already
      // saw the request disappear, so saying why tells them nothing new.
      if (!mine && (await cooldown.active(me.id, them.id))) throw coolingDown()
      // Nothing changes: no duplicate events.
      if (mine && (mine.type === 'friend' || mine.type === 'pending_out')) {
        return { kind: 'unchanged' as const, row: mine }
      }
      const accepting = mine?.type === 'pending_in'
      const myRow = await repo.set(me.id, them.id, accepting ? 'friend' : 'pending_out')
      const theirRow = await repo.set(them.id, me.id, accepting ? 'friend' : 'pending_in')
      return { kind: 'changed' as const, myRow, theirRow, accepting }
    })
    if (change.kind === 'unchanged') return toRelationship(change.row, them)
    await Promise.all([announce(change.myRow, them), announce(change.theirRow, me)])
    if (change.accepting) await sharePresence(me.id, them.id)
    return toRelationship(change.myRow, them)
  }

  const findTarget = async (me: UserRow, targetId: Snowflake) => {
    const target = targetId === me.id ? null : await users.findById(targetId)
    if (!target) throw unknownUser()
    return target
  }

  return {
    async list(userId: Snowflake): Promise<Relationship[]> {
      const rows = await relationships.list(userId)
      return rows.map(({ relationship, user }) => toRelationship(relationship, user))
    },

    async requestByUsername(me: UserRow, username: string): Promise<Relationship> {
      const target = await users.findByUsername(username)
      if (!target || target.id === me.id) throw requestFailed()
      return befriend(me, target)
    },

    async put(me: UserRow, targetId: Snowflake, type: 'friend' | 'blocked'): Promise<Relationship> {
      const target = await findTarget(me, targetId)
      if (type === 'friend') return befriend(me, target)

      const { row, theirs } = await withPair(me.id, target.id, async (repo) => {
        const found = await repo.find(target.id, me.id)
        // Their friendship or request ends; their own block of me stays.
        if (found && found.type !== 'blocked') await repo.remove(target.id, me.id)
        return { row: await repo.set(me.id, target.id, 'blocked'), theirs: found }
      })
      await announce(row, target)
      if (theirs && theirs.type !== 'blocked') await announceRemoval(target.id, me.id)
      if (theirs?.type === 'friend') await hidePresence(me.id, target.id)
      return toRelationship(row, target)
    },

    /** Unfriend, cancel, decline or unblock. */
    async remove(me: UserRow, targetId: Snowflake): Promise<void> {
      const target = await findTarget(me, targetId)
      const removed = await withPair(me.id, target.id, async (repo) => {
        const mine = await repo.find(me.id, target.id)
        if (!mine) return null
        await repo.remove(me.id, target.id)
        if (mine.type === 'blocked') return { pairs: false, wereFriends: false, declined: false }
        const theirs = await repo.find(target.id, me.id)
        if (theirs && theirs.type !== 'blocked') await repo.remove(target.id, me.id)
        return {
          pairs: true,
          wereFriends: mine.type === 'friend',
          declined: mine.type === 'pending_in',
        }
      })
      if (!removed) return
      const { pairs, wereFriends, declined } = removed
      if (declined) await cooldown.start(target.id, me.id)
      await announceRemoval(me.id, target.id)
      if (pairs) await announceRemoval(target.id, me.id)
      if (wereFriends) await hidePresence(me.id, target.id)
    },

    /** Whether either user blocked the other (no messages between them). */
    async eitherBlocked(a: Snowflake, b: Snowflake): Promise<boolean> {
      const { mine, theirs } = await relationships.between(a, b)
      return mine?.type === 'blocked' || theirs?.type === 'blocked'
    },
  }
}

export type RelationshipService = ReturnType<typeof createRelationshipService>
