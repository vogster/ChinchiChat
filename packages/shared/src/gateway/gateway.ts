import { z } from 'zod'

import { qrSignInEventSchema } from '../auth/qr-login.schemas'
import { privateChannelSchema } from '../dms/private-channel.schemas'
import { deviceApprovalSchema } from '../e2ee/approval.schemas'
import { handshakeSchema } from '../e2ee/e2ee.schemas'
import { guildEmojiSchema } from '../guilds/emoji.schemas'
import {
  channelSchema,
  guildDetailSchema,
  guildSchema,
  memberSchema,
} from '../guilds/guild.schemas'
import { interactionSchema } from '../messages/command.schemas'
import { mentionCountsSchema, messageSchema, readStateSchema } from '../messages/message.schemas'
import { pollUpdateEventSchema } from '../messages/poll.schemas'
import { encryptedReactionEventSchema, reactionEventSchema } from '../messages/reaction.schemas'
import { roleSchema } from '../permissions/role.schemas'
import { snowflakeSchema } from '../snowflake/snowflake'
import { customStatusSchema } from '../users/custom-status.schemas'
import { notificationSettingSchema } from '../users/notification.schemas'
import { relationshipRemoveSchema, relationshipSchema } from '../users/relationship.schemas'
import { currentUserSchema, publicUserSchema } from '../users/user.schemas'
import { voiceMoveEventSchema, voiceStateSchema } from '../voice/voice.schemas'

export const GATEWAY_VERSION = 1
/** Client frames above this size are rejected before parsing. */
export const MAX_CLIENT_FRAME_BYTES = 4096

export const Opcode = {
  /** s→c: an event (`t`) with a sequence number (`s`). */
  Dispatch: 0,
  /** c→s: keep-alive carrying the last sequence the client has seen. */
  Heartbeat: 1,
  /** c→s: start a session (token for native clients; browsers use the session cookie). */
  Identify: 2,
  /** c→s: change own status. */
  PresenceUpdate: 3,
  /** c→s: continue a dropped session and replay missed events. */
  Resume: 6,
  /** s→c: please reconnect and resume (e.g. server shutting down). */
  Reconnect: 7,
  /** s→c: the session cannot be resumed (`d: false`) — identify again. */
  InvalidSession: 9,
  /** s→c: first frame, tells the heartbeat interval. */
  Hello: 10,
  /** s→c: heartbeat received. */
  HeartbeatAck: 11,
} as const

export const CloseCode = {
  UnknownError: 4000,
  DecodeError: 4001,
  NotAuthenticated: 4003,
  AuthenticationFailed: 4004,
  AlreadyAuthenticated: 4005,
  RateLimited: 4008,
  SessionTimedOut: 4009,
} as const

/** What others see. */
export const presenceStatusSchema = z.enum(['online', 'idle', 'dnd', 'offline'])
/** What a user can choose; invisible appears offline to others. */
export const selectableStatusSchema = z.enum(['online', 'idle', 'dnd', 'invisible'])

const clientMessageSchema = z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal(Opcode.Heartbeat), d: z.number().int().min(0).nullable() }),
  z.strictObject({
    op: z.literal(Opcode.Identify),
    d: z.strictObject({ token: z.string().max(256).optional() }),
  }),
  z.strictObject({
    op: z.literal(Opcode.PresenceUpdate),
    d: z.strictObject({ status: selectableStatusSchema }),
  }),
  z.strictObject({
    op: z.literal(Opcode.Resume),
    d: z.strictObject({
      sessionId: z.string().min(1).max(64),
      seq: z.number().int().min(0),
      token: z.string().max(256).optional(),
    }),
  }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

/** Parses one client frame; never throws. */
export const parseClientMessage = (
  raw: string,
): { readonly ok: true; readonly message: ClientMessage } | { readonly ok: false } => {
  if (raw.length > MAX_CLIENT_FRAME_BYTES) return { ok: false }
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ok: true, message: parsed.data } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export const presenceSchema = z.object({
  userId: snowflakeSchema,
  status: presenceStatusSchema,
  /** Absent or null: none (offline users never show one). */
  customStatus: customStatusSchema.nullable().optional(),
})

/** Payload schema of every dispatched event, keyed by event name. */
export const dispatchSchemas = {
  READY: z.object({
    sessionId: z.string(),
    user: currentUserSchema,
    guilds: z.array(guildDetailSchema),
    presences: z.array(presenceSchema),
    readStates: z.array(readStateSchema),
    notificationSettings: z.array(notificationSettingSchema),
    /** My own custom status, also while invisible (others see it only when I am not). */
    customStatus: customStatusSchema.nullable().optional(),
    mentionCounts: mentionCountsSchema,
    privateChannels: z.array(privateChannelSchema),
    /** Who is in the voice channels the user can see. */
    voiceStates: z.array(voiceStateSchema),
  }),
  RESUMED: z.object({}),
  MESSAGE_CREATE: messageSchema,
  MESSAGE_UPDATE: messageSchema,
  MESSAGE_DELETE: z.object({
    id: snowflakeSchema,
    channelId: snowflakeSchema,
    guildId: snowflakeSchema.nullable(),
  }),
  MESSAGE_REACTION_ADD: reactionEventSchema,
  MESSAGE_REACTION_REMOVE: reactionEventSchema,
  E2EE_REACTION_UPDATE: encryptedReactionEventSchema,
  /** A poll's counts changed, or it ended. */
  POLL_UPDATE: pollUpdateEventSchema,
  TYPING_START: z.object({
    channelId: snowflakeSchema,
    guildId: snowflakeSchema.nullable(),
    userId: snowflakeSchema,
    timestamp: z.iso.datetime(),
  }),
  PRESENCE_UPDATE: presenceSchema,
  /** Joining a server also brings who is online in it. */
  GUILD_CREATE: guildDetailSchema.extend({ presences: z.array(presenceSchema).optional() }),
  GUILD_UPDATE: guildSchema,
  GUILD_DELETE: z.object({ id: snowflakeSchema }),
  CHANNEL_CREATE: channelSchema,
  CHANNEL_UPDATE: channelSchema,
  CHANNEL_DELETE: z.object({ id: snowflakeSchema, guildId: snowflakeSchema }),
  GUILD_MEMBER_ADD: z.object({ guildId: snowflakeSchema, member: memberSchema }),
  GUILD_MEMBER_REMOVE: z.object({ guildId: snowflakeSchema, userId: snowflakeSchema }),
  GUILD_ROLE_CREATE: z.object({ guildId: snowflakeSchema, role: roleSchema }),
  GUILD_ROLE_UPDATE: z.object({ guildId: snowflakeSchema, role: roleSchema }),
  GUILD_ROLE_DELETE: z.object({ guildId: snowflakeSchema, roleId: snowflakeSchema }),
  /** The server's emoji changed: the whole new list. */
  GUILD_EMOJIS_UPDATE: z.object({ guildId: snowflakeSchema, emojis: z.array(guildEmojiSchema) }),
  /** To a bot: someone ran one of its commands. */
  INTERACTION_CREATE: interactionSchema,
  /** A member's roles changed. */
  GUILD_MEMBER_UPDATE: z.object({
    guildId: snowflakeSchema,
    userId: snowflakeSchema,
    roleIds: z.array(snowflakeSchema),
    nickname: z.string().nullable(),
    timeoutUntil: z.iso.datetime().nullable(),
    /** Set when it changed: the member accepted the server's rules. */
    pending: z.boolean().optional(),
  }),
  /** A friend, a request or a block appeared (or changed) for this user. */
  /** A DM or group DM appeared, changed or was left. */
  PRIVATE_CHANNEL_CREATE: privateChannelSchema,
  PRIVATE_CHANNEL_UPDATE: privateChannelSchema,
  PRIVATE_CHANNEL_DELETE: z.object({ id: snowflakeSchema }),
  RELATIONSHIP_ADD: relationshipSchema,
  RELATIONSHIP_REMOVE: relationshipRemoveSchema,
  /** Someone's public profile changed (name or avatar). */
  USER_UPDATE: publicUserSchema,
  VOICE_STATE_UPDATE: voiceStateSchema,
  /** A moderator moved this user to another voice channel. */
  VOICE_MOVE: voiceMoveEventSchema,
  /** Another device of the same user read up to this message. */
  CHANNEL_ACK: readStateSchema.extend({ mentionCount: z.number().int().nonnegative() }),
  /** A commit or Welcome in an encrypted conversation (Welcomes reach only their device's user). */
  E2EE_HANDSHAKE: handshakeSchema,
  /** Someone in a shared encrypted conversation added or removed a device. */
  E2EE_DEVICES_UPDATE: z.object({ userId: snowflakeSchema }),
  /** A new session by a QR sign-in (to all of the user's sessions). */
  SESSION_CREATE: qrSignInEventSchema,
  /** A device approval moved on (to all of the user's sessions). */
  E2EE_APPROVAL_UPDATE: deviceApprovalSchema,
  /** Another device of the same user changed notification settings (null: back to defaults). */
  NOTIFICATION_SETTINGS_UPDATE: z.object({
    targetId: snowflakeSchema,
    setting: notificationSettingSchema.nullable(),
  }),
} as const

export type DispatchType = keyof typeof dispatchSchemas
export type DispatchPayload<T extends DispatchType> = z.infer<(typeof dispatchSchemas)[T]>
export type PresenceStatus = z.infer<typeof presenceStatusSchema>
export type SelectableStatus = z.infer<typeof selectableStatusSchema>
export type Presence = z.infer<typeof presenceSchema>

export type ServerMessage =
  | {
      readonly op: typeof Opcode.Dispatch
      readonly t: DispatchType
      readonly s: number
      readonly d: unknown
    }
  | {
      readonly op: typeof Opcode.Hello
      readonly d: { readonly heartbeatInterval: number; readonly version: number }
    }
  | { readonly op: typeof Opcode.HeartbeatAck }
  | { readonly op: typeof Opcode.Reconnect }
  | { readonly op: typeof Opcode.InvalidSession; readonly d: boolean }
