import type { E2eeStore } from './store'

/** "Anna added Boris": who came into an encrypted group, by whose commit. */
export interface MemberNotice {
  readonly id: string
  /** Whose device made the commit (as the server named it among the members), if known. */
  readonly byUserId: string | null
  readonly userIds: readonly string[]
}

const knownKey = (channelId: string) => `group:known:${channelId}`
const invitedKey = (channelId: string) => `group:invited:${channelId}`
const noticesKey = (channelId: string) => `group:notices:${channelId}`

const without = (ids: readonly string[], gone: ReadonlySet<string>) =>
  ids.filter((id) => !gone.has(id))

/**
 * Who may come into an encrypted group from this device. The server lists the members, and a
 * server that can't be trusted could list one of its own: so a person goes in only if they are
 * known here (in the group already, or before) or this device added them. Everyone else waits
 * for a member's commit, which the server can't forge; when one brings someone new, the people
 * here are told who added whom. Two people alone have no one to add: none of this applies.
 */
export const createGroupMembership = (store: E2eeStore) => {
  const list = async (key: string) => (await store.get<string[]>(key)) ?? []

  return {
    /** People added from this device (it takes them in as soon as they have devices). */
    async invite(channelId: string, userIds: readonly string[]): Promise<void> {
      const invited = await list(invitedKey(channelId))
      await store.set(invitedKey(channelId), [...new Set([...invited, ...userIds])])
    },

    /** The group as this device started or joined it: everyone in it then is known. */
    async begin(channelId: string, userIds: readonly string[]): Promise<void> {
      await store.set(knownKey(channelId), [...new Set(userIds)])
    },

    /**
     * Brings what is known in step: who is in the group now is known, who left the members is
     * not anymore, and whom this device added and is in needs no reminder. A conversation from
     * before this check takes the members as they are (once, like a first key).
     */
    async settle(
      channelId: string,
      memberIds: readonly string[],
      present: readonly string[],
    ): Promise<ReadonlySet<string>> {
      const stored = await store.get<string[]>(knownKey(channelId))
      const listed = new Set(memberIds)
      const left = new Set([...(stored ?? memberIds), ...present].filter((id) => !listed.has(id)))
      const known = without([...new Set([...(stored ?? memberIds), ...present])], left)
      await store.set(knownKey(channelId), known)
      const invited = await list(invitedKey(channelId))
      const inNow = new Set(present)
      await store.set(
        invitedKey(channelId),
        invited.filter((id) => listed.has(id) && !inNow.has(id)),
      )
      return new Set([...known, ...invited.filter((id) => listed.has(id))])
    },

    /** A member's commit brought these people in: they are known, and the people here told. */
    async arrived(channelId: string, byUserId: string | null, userIds: readonly string[]) {
      const known = new Set(await list(knownKey(channelId)))
      const fresh = userIds.filter((id) => !known.has(id))
      await store.set(knownKey(channelId), [...known, ...fresh])
      if (fresh.length === 0) return
      const notices = (await store.get<MemberNotice[]>(noticesKey(channelId))) ?? []
      const notice: MemberNotice = { id: crypto.randomUUID(), byUserId, userIds: fresh }
      await store.set(noticesKey(channelId), [...notices, notice])
    },

    notices: async (channelId: string): Promise<MemberNotice[]> =>
      (await store.get<MemberNotice[]>(noticesKey(channelId))) ?? [],

    async dismiss(channelId: string, noticeId: string): Promise<void> {
      const notices = (await store.get<MemberNotice[]>(noticesKey(channelId))) ?? []
      await store.set(
        noticesKey(channelId),
        notices.filter((notice) => notice.id !== noticeId),
      )
    },
  }
}

export type GroupMembership = ReturnType<typeof createGroupMembership>
