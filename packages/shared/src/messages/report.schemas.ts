import { z } from 'zod'

import { snowflakeSchema } from '../snowflake/snowflake'
import { publicUserSchema } from '../users/user.schemas'

export const REPORT_DETAILS_MAX_LENGTH = 500

export const reportReasonSchema = z.enum(['spam', 'harassment', 'nsfw', 'illegal', 'other'])
export const reportStatusSchema = z.enum(['open', 'resolved', 'dismissed'])

export const createReportRequestSchema = z.strictObject({
  reason: reportReasonSchema,
  details: z.string().trim().max(REPORT_DETAILS_MAX_LENGTH).optional(),
})

/**
 * A report as moderators see it. The message is a copy taken when it was reported, so
 * it can still be judged after the author edits or deletes it.
 */
export const reportSchema = z.object({
  id: snowflakeSchema,
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
  messageId: snowflakeSchema,
  author: publicUserSchema.nullable(),
  content: z.string(),
  reporter: publicUserSchema.nullable(),
  reason: reportReasonSchema,
  details: z.string().nullable(),
  status: reportStatusSchema,
  resolvedBy: publicUserSchema.nullable(),
  createdAt: z.iso.datetime(),
})

export const reportsQuerySchema = z.object({
  status: reportStatusSchema.default('open'),
  before: snowflakeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** Closing a report: `resolved` when acted on, `dismissed` when nothing was wrong. */
export const updateReportRequestSchema = z.strictObject({
  status: z.enum(['resolved', 'dismissed']),
})

export type ReportReason = z.infer<typeof reportReasonSchema>
export type ReportStatus = z.infer<typeof reportStatusSchema>
export type CreateReportRequest = z.input<typeof createReportRequestSchema>
export type Report = z.infer<typeof reportSchema>
export type ReportsQuery = z.input<typeof reportsQuerySchema>
