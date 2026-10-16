import {
  acceptApprovalRequestSchema,
  completeApprovalRequestSchema,
  createApprovalRequestSchema,
  deviceApprovalSchema,
  revealApprovalRequestSchema,
  snowflakeSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { perUserRateLimit } from '../../http/rate-limit'
import { requireHuman } from '../auth/auth.plugin'

import type { ApprovalService } from './approval.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface ApprovalRoutesOptions {
  readonly approvalService: ApprovalService
}

const approvalResponse = z.object({
  success: z.literal(true),
  data: z.object({ approval: deviceApprovalSchema }),
})
const params = z.object({ approvalId: snowflakeSchema })

export const approvalRoutes: FastifyPluginAsyncZod<ApprovalRoutesOptions> = async (
  app,
  { approvalService },
) => {
  const path = '/users/@me/e2ee/approvals'

  app.post(
    path,
    {
      schema: { body: createApprovalRequestSchema, response: { 200: approvalResponse } },
      config: { rateLimit: perUserRateLimit('approval', 10) },
    },
    async (request) => ({
      success: true as const,
      data: {
        approval: await approvalService.request(requireHuman(request).user.id, request.body),
      },
    }),
  )

  app.get(
    `${path}/:approvalId`,
    { schema: { params, response: { 200: approvalResponse } } },
    async (request) => ({
      success: true as const,
      data: {
        approval: await approvalService.get(
          requireHuman(request).user.id,
          request.params.approvalId,
        ),
      },
    }),
  )

  app.post(
    `${path}/:approvalId/accept`,
    {
      schema: { params, body: acceptApprovalRequestSchema, response: { 200: approvalResponse } },
      config: { rateLimit: perUserRateLimit('approval', 30) },
    },
    async (request) => ({
      success: true as const,
      data: {
        approval: await approvalService.accept(
          requireHuman(request).user.id,
          request.params.approvalId,
          request.body,
        ),
      },
    }),
  )

  app.post(
    `${path}/:approvalId/reveal`,
    {
      schema: { params, body: revealApprovalRequestSchema, response: { 200: approvalResponse } },
      config: { rateLimit: perUserRateLimit('approval', 30) },
    },
    async (request) => ({
      success: true as const,
      data: {
        approval: await approvalService.reveal(
          requireHuman(request).user.id,
          request.params.approvalId,
          request.body.publicKey,
        ),
      },
    }),
  )

  app.post(
    `${path}/:approvalId/complete`,
    {
      schema: { params, body: completeApprovalRequestSchema, response: { 200: approvalResponse } },
      config: { rateLimit: perUserRateLimit('approval', 30) },
    },
    async (request) => ({
      success: true as const,
      data: {
        approval: await approvalService.complete(
          requireHuman(request).user.id,
          request.params.approvalId,
          request.body.secrets,
        ),
      },
    }),
  )

  app.delete(`${path}/:approvalId`, { schema: { params } }, async (request, reply) => {
    await approvalService.decline(requireHuman(request).user.id, request.params.approvalId)
    return reply.status(204).send()
  })
}
