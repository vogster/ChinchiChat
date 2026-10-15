import type { Snowflake, VoiceState } from '@chinchi/shared'
import type { Redis } from 'ioredis'

const PREFIX = 'chinchi:voice:'
const stateKey = (userId: Snowflake) => `${PREFIX}user:${userId}`
const guildKey = (guildId: Snowflake) => `${PREFIX}guild:${guildId}`
/** DM calls are indexed by channel: they belong to no server. */
const dmKey = (channelId: Snowflake) => `${PREFIX}dm:${channelId}`
const intentKey = (userId: Snowflake) => `${PREFIX}intent:${userId}`
const leftKey = (sid: string) => `${PREFIX}left:${sid}`

/** How the user asked to join; applied when LiveKit reports them in the room. */
export interface JoinIntent {
  readonly channelId: Snowflake
  readonly selfMute: boolean
  readonly selfDeaf: boolean
}

/** A voice state and the LiveKit connection (participant sid) it belongs to. */
export interface VoiceEntry {
  readonly state: VoiceState
  readonly sid: string
}

/** A pending join is forgotten if the client never connects. */
const INTENT_TTL_S = 300
/** How long a finished connection is remembered, so its late "joined" webhook is ignored. */
const LEFT_TTL_S = 300

const FLAGS = ['selfMute', 'selfDeaf', 'serverMute', 'serverDeaf', 'video', 'stream'] as const
type Flag = (typeof FLAGS)[number]

const toHash = ({ state, sid }: VoiceEntry): Record<string, string> => ({
  guildId: state.guildId ?? '',
  channelId: state.channelId ?? '',
  userId: state.userId,
  sid,
  ...Object.fromEntries(FLAGS.map((flag) => [flag, state[flag] ? '1' : '0'])),
})

const fromHash = (hash: Record<string, string>): VoiceEntry | null => {
  if (!hash.userId || !hash.channelId || !hash.sid) return null
  return {
    sid: hash.sid,
    state: {
      guildId: hash.guildId || null,
      channelId: hash.channelId,
      userId: hash.userId,
      ...(Object.fromEntries(FLAGS.map((flag) => [flag, hash[flag] === '1'])) as Record<
        Flag,
        boolean
      >),
    },
  }
}

// Webhooks arrive concurrently and out of order. Everything is keyed by the LiveKit connection
// (sid): a leave only removes its own connection, and a connection that already left can never
// be written back by a late "joined".
const PUT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
redis.call('DEL', KEYS[1])
redis.call('HSET', KEYS[1], unpack(ARGV, 2))
redis.call('SADD', KEYS[3], ARGV[1])
return 1`

const REMOVE = `
redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
if redis.call('HGET', KEYS[1], 'sid') ~= ARGV[1] then return 0 end
local guild = redis.call('HGET', KEYS[1], 'guildId')
local channel = redis.call('HGET', KEYS[1], 'channelId')
redis.call('DEL', KEYS[1])
if guild ~= '' then redis.call('SREM', ARGV[3] .. 'guild:' .. guild, ARGV[4])
else redis.call('SREM', ARGV[3] .. 'dm:' .. channel, ARGV[4]) end
return 1`

const PATCH_IF = `
if redis.call('HGET', KEYS[1], ARGV[1]) ~= ARGV[2] then return 0 end
for i = 3, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]) end
return 1`

const TAKE_INTENT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
if cjson.decode(raw).channelId ~= ARGV[1] then return nil end
redis.call('DEL', KEYS[1])
return raw`

/** The entries of the users in an index set, dropping members whose state moved on. */
const listIndexed = async (
  redis: Redis,
  key: string,
  belongs: (state: VoiceState) => boolean,
): Promise<VoiceEntry[]> => {
  const userIds = await redis.smembers(key)
  if (userIds.length === 0) return []
  const pipeline = redis.pipeline()
  for (const userId of userIds) pipeline.hgetall(stateKey(userId))
  const results = (await pipeline.exec()) ?? []
  const entries = results.map(([, hash]) => fromHash((hash ?? {}) as Record<string, string>))
  const stale = userIds.filter((_, i) => {
    const entry = entries[i]
    return !entry || !belongs(entry.state)
  })
  if (stale.length > 0) await redis.srem(key, ...stale)
  return entries.filter((entry): entry is VoiceEntry => entry !== null && belongs(entry.state))
}

/** Who is in voice where: a hash per user, and the users per server or per DM call, in Valkey. */
export const createVoiceStateStore = (redis: Redis) => {
  const getEntry = async (userId: Snowflake) => fromHash(await redis.hgetall(stateKey(userId)))

  const patch = async (
    userId: Snowflake,
    field: 'sid' | 'channelId',
    expected: string,
    flags: Partial<Record<Flag, boolean>>,
  ): Promise<VoiceState | null> => {
    const pairs = Object.entries(flags).flatMap(([flag, on]) => [flag, on ? '1' : '0'])
    const patched = await redis.eval(PATCH_IF, 1, stateKey(userId), field, expected, ...pairs)
    return patched === 1 ? ((await getEntry(userId))?.state ?? null) : null
  }

  return {
    getEntry,

    async get(userId: Snowflake): Promise<VoiceState | null> {
      return (await getEntry(userId))?.state ?? null
    },

    /** Records a connection; false when that connection already left (a late webhook). */
    async put(entry: VoiceEntry): Promise<boolean> {
      const { state } = entry
      const index = state.guildId ? guildKey(state.guildId) : dmKey(state.channelId ?? '')
      const fields = Object.entries(toHash(entry)).flat()
      const written = await redis.eval(
        PUT,
        3,
        stateKey(state.userId),
        leftKey(entry.sid),
        index,
        state.userId,
        ...fields,
      )
      return written === 1
    },

    /** Ends a connection; true when it was the user's current one (their state is gone). */
    async remove(userId: Snowflake, sid: string): Promise<boolean> {
      const removed = await redis.eval(
        REMOVE,
        2,
        stateKey(userId),
        leftKey(sid),
        sid,
        LEFT_TTL_S,
        PREFIX,
        userId,
      )
      return removed === 1
    },

    /** Sets flags if `sid` is still the user's connection (camera and screen webhooks). */
    patchConnection(userId: Snowflake, sid: string, flags: Partial<Record<Flag, boolean>>) {
      return patch(userId, 'sid', sid, flags)
    },

    /** Sets flags if the user is still in `channelId` (their own and moderators' changes). */
    patchIfIn(userId: Snowflake, channelId: Snowflake, flags: Partial<Record<Flag, boolean>>) {
      return patch(userId, 'channelId', channelId, flags)
    },

    /** Everyone in voice on a server (entries left behind by a move elsewhere are dropped). */
    listForGuild(guildId: Snowflake): Promise<VoiceEntry[]> {
      return listIndexed(redis, guildKey(guildId), (state) => state.guildId === guildId)
    },

    /** Everyone in a DM's call. */
    listForDm(channelId: Snowflake): Promise<VoiceEntry[]> {
      return listIndexed(
        redis,
        dmKey(channelId),
        (state) => state.guildId === null && state.channelId === channelId,
      )
    },

    /** Every recorded connection, for reconciling with LiveKit. */
    async listAll(): Promise<VoiceEntry[]> {
      const entries: VoiceEntry[] = []
      let cursor = '0'
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', stateKey('*'), 'COUNT', 200)
        cursor = next
        for (const key of keys) {
          const entry = fromHash(await redis.hgetall(key))
          if (entry) entries.push(entry)
        }
      } while (cursor !== '0')
      return entries
    },

    async setIntent(userId: Snowflake, intent: JoinIntent): Promise<void> {
      await redis.set(intentKey(userId), JSON.stringify(intent), 'EX', INTENT_TTL_S)
    },

    /** The pending join for this channel, used once; one for another channel is kept. */
    async takeIntent(userId: Snowflake, channelId: Snowflake): Promise<JoinIntent | null> {
      const raw = await redis.eval(TAKE_INTENT, 1, intentKey(userId), channelId)
      return typeof raw === 'string' ? (JSON.parse(raw) as JoinIntent) : null
    },

    /** Remembers a webhook delivery; false when this event was handled already (a replay). */
    async firstDelivery(eventId: string): Promise<boolean> {
      return (await redis.set(`${PREFIX}event:${eventId}`, '1', 'EX', LEFT_TTL_S, 'NX')) === 'OK'
    },
  }
}

export type VoiceStateStore = ReturnType<typeof createVoiceStateStore>
