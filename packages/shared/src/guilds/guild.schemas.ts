import { z } from 'zod'

import { guildEmojiSchema } from './emoji.schemas'

import { permissionOverwriteSchema, roleSchema } from '../permissions/role.schemas'
import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

export const GUILD_NAME_MIN_LENGTH = 2
export const GUILD_NAME_MAX_LENGTH = 100
export const CHANNEL_NAME_MAX_LENGTH = 100
export const CHANNEL_TOPIC_MAX_LENGTH = 1024
/** Slowmode tops out at six hours between one member's messages. */
export const MAX_SLOWMODE_SECONDS = 21_600
export const MAX_INVITE_AGE_SECONDS = 7 * 24 * 60 * 60
/** Channels of a server, categories included and threads not. */
export const MAX_CHANNELS_PER_GUILD = 500
/** Invites of a server that still work (not expired, not used up). */
export const MAX_INVITES_PER_GUILD = 1000
export const MAX_INVITE_USES = 100

export const guildNameSchema = z
  .string()
  .trim()
  .min(GUILD_NAME_MIN_LENGTH)
  .max(GUILD_NAME_MAX_LENGTH)

/** A thread is a channel inside a text channel, with that channel's permissions. */
export const channelTypeSchema = z.enum(['text', 'voice', 'category', 'thread'])
export type ChannelType = z.infer<typeof channelTypeSchema>
/** What can be created as a channel; threads come from `createThreadRequestSchema`. */
export const creatableChannelTypeSchema = z.enum(['text', 'voice', 'category'])

export const THREAD_NAME_MAX_LENGTH = 100

/** Control and invisible formatting characters (direction overrides, zero-width) are dropped. */
const withoutHiddenCharacters = (text: string) => text.replace(/[\p{Cc}\p{Cf}]/gu, '')

export const createThreadRequestSchema = z.strictObject({
  name: z
    .string()
    .max(THREAD_NAME_MAX_LENGTH * 2)
    .transform((name) => withoutHiddenCharacters(name).trim())
    .pipe(z.string().min(1).max(THREAD_NAME_MAX_LENGTH)),
  /** The message the thread answers; one thread per message. */
  messageId: snowflakeSchema.optional(),
})

/** Text channels look like `#off-topic`: lowercase, whitespace runs become single dashes. */
export const normalizeTextChannelName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')

const channelName = (type: ChannelType, name: string) =>
  type === 'text' ? normalizeTextChannelName(name) : name.trim()

export const channelTopicSchema = z.string().trim().max(CHANNEL_TOPIC_MAX_LENGTH)

export const createGuildRequestSchema = z.strictObject({
  name: guildNameSchema,
  /** Language for the default channel names. */
  locale: z.enum(['ru', 'en']).default('en'),
})

export const GUILD_RULES_MAX_LENGTH = 2000

/** Server rules; blank turns them off. Newcomers accept them before they may talk. */
export const guildRulesSchema = z
  .string()
  .max(GUILD_RULES_MAX_LENGTH * 2)
  .transform((rules) => rules.trim())
  .pipe(z.string().max(GUILD_RULES_MAX_LENGTH))
  .transform((rules) => rules || null)

export const updateGuildRequestSchema = z
  .strictObject({
    name: guildNameSchema.optional(),
    rules: guildRulesSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const transferOwnershipRequestSchema = z.strictObject({ userId: snowflakeSchema })

export const createChannelRequestSchema = z
  .strictObject({
    type: creatableChannelTypeSchema,
    name: z.string().max(CHANNEL_NAME_MAX_LENGTH * 2),
    parentId: snowflakeSchema.nullable().default(null),
    topic: channelTopicSchema.optional(),
  })
  .transform((body) => ({ ...body, name: channelName(body.type, body.name) }))
  .refine((body) => body.name.length > 0 && body.name.length <= CHANNEL_NAME_MAX_LENGTH, {
    path: ['name'],
    message: `Channel name must be 1-${CHANNEL_NAME_MAX_LENGTH} characters`,
  })
  .refine((body) => body.type !== 'category' || body.parentId === null, {
    path: ['parentId'],
    message: 'Categories cannot be nested',
  })

/** The channel type is fixed, so the name is normalized on the server against the stored type. */
export const updateChannelRequestSchema = z
  .strictObject({
    name: z
      .string()
      .max(CHANNEL_NAME_MAX_LENGTH * 2)
      .optional(),
    topic: channelTopicSchema.nullable().optional(),
    parentId: snowflakeSchema.nullable().optional(),
    /** Seconds each member waits between messages (text channels); 0 turns it off. */
    rateLimitPerUser: z.number().int().min(0).max(MAX_SLOWMODE_SECONDS).optional(),
    /** Age-restricted (text channels): clients ask before showing it. */
    nsfw: z.boolean().optional(),
    /** Announcements (text channels): messages can be published to following channels. */
    announcement: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update')

export const reorderChannelsRequestSchema = z
  .array(
    z.strictObject({
      id: snowflakeSchema,
      position: z.number().int().min(0).max(10_000),
      parentId: snowflakeSchema.nullable().optional(),
    }),
  )
  .min(1)
  .max(500)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Duplicate ids')

export const createInviteRequestSchema = z.strictObject({
  /** 0 means the invite never expires. */
  maxAgeSeconds: z
    .number()
    .int()
    .min(0)
    .max(MAX_INVITE_AGE_SECONDS)
    .default(MAX_INVITE_AGE_SECONDS),
  /** 0 means unlimited uses. */
  maxUses: z.number().int().min(0).max(MAX_INVITE_USES).default(0),
})

export const guildSchema = z.object({
  id: snowflakeSchema,
  name: z.string(),
  /** API path of the server icon (public, cacheable); null shows initials. */
  iconUrl: z.string().nullable(),
  ownerId: snowflakeSchema,
  createdAt: z.iso.datetime(),
  /** Rules newcomers accept before they may talk; null when the server has none. */
  rules: z.string().nullable(),
})

export const channelSchema = z.object({
  id: snowflakeSchema,
  guildId: snowflakeSchema,
  type: channelTypeSchema,
  name: z.string(),
  topic: z.string().nullable(),
  parentId: snowflakeSchema.nullable(),
  position: z.number().int(),
  /** Newest message (text channels); compare with the read state to show unread. */
  lastMessageId: snowflakeSchema.nullable(),
  permissionOverwrites: z.array(permissionOverwriteSchema),
  /** Slowmode: seconds between one member's messages; 0 when off. */
  rateLimitPerUser: z.number().int().min(0),
  nsfw: z.boolean(),
  /** Text channels whose messages can be published to channels that follow them. */
  announcement: z.boolean(),
  /** Threads: the message they were started from, if any. */
  threadStarterId: snowflakeSchema.nullable(),
  /** Threads: how many messages they hold. */
  messageCount: z.number().int().min(0),
  /** Threads: who started it. */
  ownerId: snowflakeSchema.nullable(),
})

/** A server as one member sees it: only the channels they can view, plus their own roles. */
export const guildDetailSchema = guildSchema.extend({
  channels: z.array(channelSchema),
  roles: z.array(roleSchema),
  myRoleIds: z.array(snowflakeSchema),
  /** The server's own emoji. */
  emojis: z.array(guildEmojiSchema),
  /** When the viewer's own timeout here ends; null when there is none. */
  myTimeoutUntil: z.iso.datetime().nullable(),
  /** I joined after the rules were set and have not accepted them yet: I may only read. */
  myPending: z.boolean(),
})

export const memberSchema = z.object({
  user: publicUserSchema,
  roleIds: z.array(snowflakeSchema),
  nickname: z.string().nullable(),
  joinedAt: z.iso.datetime(),
  /** When a running timeout ends; null when there is none. */
  timeoutUntil: z.iso.datetime().nullable(),
})

export const inviteSchema = z.object({
  code: z.string(),
  guild: z.object({
    id: snowflakeSchema,
    name: z.string(),
    iconUrl: z.string().nullable(),
    memberCount: z.number().int(),
  }),
  channel: z.object({ id: snowflakeSchema, name: z.string(), type: channelTypeSchema }),
  inviter: publicUserSchema.nullable(),
  uses: z.number().int(),
  maxUses: z.number().int().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

export type CreateGuildRequest = z.input<typeof createGuildRequestSchema>
export type UpdateGuildRequest = z.infer<typeof updateGuildRequestSchema>
export type CreateChannelRequest = z.input<typeof createChannelRequestSchema>
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>
export type UpdateChannelRequest = z.infer<typeof updateChannelRequestSchema>
export type ReorderChannelsRequest = z.infer<typeof reorderChannelsRequestSchema>
export type CreateInviteRequest = z.input<typeof createInviteRequestSchema>
export type Guild = z.infer<typeof guildSchema>
export type Channel = z.infer<typeof channelSchema>
export type GuildDetail = z.infer<typeof guildDetailSchema>
export type Member = z.infer<typeof memberSchema>
export type Invite = z.infer<typeof inviteSchema>
