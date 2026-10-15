import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'
import { MESSAGE_MAX_LENGTH } from './message.schemas'

export const MAX_COMMANDS_PER_BOT = 50
export const MAX_COMMAND_OPTIONS = 10
export const COMMAND_OPTION_MAX_LENGTH = 1000

/** As in Discord: lowercase, typed after `/`. */
const commandNameSchema = z
  .string()
  .regex(/^[a-z0-9_-]{1,32}$/, 'Use 1-32 lowercase latin letters, digits, "_" or "-"')

export const commandOptionSchema = z.object({
  name: commandNameSchema,
  description: z.string().trim().min(1).max(100),
  required: z.boolean().default(false),
})

export const commandDefinitionSchema = z.object({
  name: commandNameSchema,
  description: z.string().trim().min(1).max(100),
  options: z
    .array(commandOptionSchema)
    .max(MAX_COMMAND_OPTIONS)
    .default([])
    .refine((options) => new Set(options.map((o) => o.name)).size === options.length, {
      message: 'Option names must differ',
    }),
})

/** A bot replaces its whole command list at once. */
export const putCommandsRequestSchema = z
  .array(commandDefinitionSchema)
  .max(MAX_COMMANDS_PER_BOT)
  .refine((commands) => new Set(commands.map((c) => c.name)).size === commands.length, {
    message: 'Command names must differ',
  })

/** A command as people on a server see it: with the bot that answers it. */
export const commandSchema = z.object({
  id: snowflakeSchema,
  name: z.string(),
  description: z.string(),
  options: z.array(z.object({ name: z.string(), description: z.string(), required: z.boolean() })),
  bot: publicUserSchema,
})

/** Someone runs a command in a channel; option values are text. */
export const invokeCommandRequestSchema = z.strictObject({
  commandId: snowflakeSchema,
  options: z.record(z.string(), z.string().max(COMMAND_OPTION_MAX_LENGTH)).default({}),
})

/** What the bot receives over the gateway (`INTERACTION_CREATE`). */
export const interactionSchema = z.object({
  id: snowflakeSchema,
  /** Answers this interaction once, within 15 minutes. */
  token: z.string(),
  command: z.object({ id: snowflakeSchema, name: z.string() }),
  options: z.record(z.string(), z.string()),
  channelId: snowflakeSchema,
  guildId: snowflakeSchema,
  user: publicUserSchema,
})

export const interactionResponseRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
})

export type CommandDefinition = z.input<typeof commandDefinitionSchema>
export type Command = z.infer<typeof commandSchema>
export type Interaction = z.infer<typeof interactionSchema>
export type InvokeCommandRequest = z.input<typeof invokeCommandRequestSchema>
