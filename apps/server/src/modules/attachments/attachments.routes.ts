import {
  attachmentUploadSchema,
  createAttachmentRequestSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireAuth } from '../auth/auth.plugin'
import { SEND_RATE_LIMIT } from '../messages/messages.routes'

import type { AttachmentService } from './attachment.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface AttachmentsRoutesOptions {
  readonly attachmentService: AttachmentService
}

/** Dropping several files at once asks for several slots; the pending cap bounds the rest. */
const UPLOAD_RATE_LIMIT = Object.freeze({ ...SEND_RATE_LIMIT, max: 30, timeWindow: 60_000 })

const fileParams = z.object({ attachmentId: snowflakeSchema, filename: z.string().max(1024) })

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })

export const attachmentsRoutes: FastifyPluginAsyncZod<AttachmentsRoutesOptions> = async (
  app,
  { attachmentService },
) => {
  app.post(
    '/channels/:channelId/attachments',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        body: createAttachmentRequestSchema,
        response: { 201: ok(z.object({ attachment: attachmentUploadSchema })) },
      },
      config: { rateLimit: UPLOAD_RATE_LIMIT },
    },
    async (request, reply) => {
      const attachment = await attachmentService.createUpload(
        request.params.channelId,
        requireAuth(request).user.id,
        request.body,
      )
      return reply.status(201).send({ success: true as const, data: { attachment } })
    },
  )

  app.get(
    '/attachments/:attachmentId/preview/:filename',
    { schema: { params: fileParams } },
    async (request, reply) => {
      const { url, maxAgeS } = await attachmentService.download(
        request.params.attachmentId,
        requireAuth(request).user.id,
        'preview',
      )
      return reply.header('cache-control', `private, max-age=${maxAgeS}`).redirect(url, 302)
    },
  )

  // The filename only makes URLs readable and downloads well-named; the id decides.
  app.get(
    '/attachments/:attachmentId/:filename',
    { schema: { params: fileParams } },
    async (request, reply) => {
      const { url, maxAgeS } = await attachmentService.download(
        request.params.attachmentId,
        requireAuth(request).user.id,
      )
      return reply.header('cache-control', `private, max-age=${maxAgeS}`).redirect(url, 302)
    },
  )
}
