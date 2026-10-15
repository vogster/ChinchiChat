import {
  claimedKeyPackageSchema,
  deviceSchema,
  handshakeSchema,
  listHandshakesQuerySchema,
  postCommitRequestSchema,
  registerDeviceRequestSchema,
  snowflakeSchema,
  uploadKeyPackagesRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { requireHuman } from '../auth/auth.plugin'

import type { E2eeService } from './e2ee.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface E2eeRoutesOptions {
  readonly e2eeService: E2eeService
}

const ok = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data })
const devicesResponse = ok(z.object({ devices: z.array(deviceSchema) }))

const perUser = (max: number) =>
  Object.freeze({
    max,
    timeWindow: 60_000,
    hook: 'preHandler' as const,
    keyGenerator: (request: { auth: { user: { id: string } } | null; ip: string }) =>
      request.auth ? `e2ee:${request.auth.user.id}` : `e2ee:${request.ip}`,
  })

export const e2eeRoutes: FastifyPluginAsyncZod<E2eeRoutesOptions> = async (
  app,
  { e2eeService },
) => {
  app.get(
    '/users/@me/devices',
    { schema: { response: { 200: devicesResponse } } },
    async (request) => {
      const { user } = requireHuman(request)
      return {
        success: true as const,
        data: { devices: await e2eeService.listDevices(user.id, user.id) },
      }
    },
  )

  app.get(
    '/users/:userId/devices',
    {
      schema: { params: z.object({ userId: snowflakeSchema }), response: { 200: devicesResponse } },
    },
    async (request) => ({
      success: true as const,
      data: {
        devices: await e2eeService.listDevices(
          requireHuman(request).user.id,
          request.params.userId,
        ),
      },
    }),
  )

  app.post(
    '/users/@me/devices',
    {
      schema: {
        body: registerDeviceRequestSchema,
        response: { 200: ok(z.object({ device: deviceSchema })) },
      },
      config: { rateLimit: perUser(10) },
    },
    async (request) => ({
      success: true as const,
      data: {
        device: await e2eeService.registerDevice(requireHuman(request).user.id, request.body),
      },
    }),
  )

  app.delete(
    '/users/@me/devices/:deviceId',
    { schema: { params: z.object({ deviceId: snowflakeSchema }) } },
    async (request, reply) => {
      await e2eeService.deleteDevice(requireHuman(request).user.id, request.params.deviceId)
      return reply.status(204).send()
    },
  )

  app.post(
    '/users/@me/devices/:deviceId/key-packages',
    {
      schema: {
        params: z.object({ deviceId: snowflakeSchema }),
        body: uploadKeyPackagesRequestSchema,
      },
      config: { rateLimit: perUser(30) },
    },
    async (request, reply) => {
      await e2eeService.uploadKeyPackages(
        requireHuman(request).user.id,
        request.params.deviceId,
        request.body,
      )
      return reply.status(204).send()
    },
  )

  app.get(
    '/users/@me/devices/:deviceId/key-packages/count',
    {
      schema: {
        params: z.object({ deviceId: snowflakeSchema }),
        response: { 200: ok(z.object({ count: z.number().int() })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        count: await e2eeService.countKeyPackages(
          requireHuman(request).user.id,
          request.params.deviceId,
        ),
      },
    }),
  )

  app.post(
    '/users/:userId/key-packages/claim',
    {
      schema: {
        params: z.object({ userId: snowflakeSchema }),
        response: { 200: ok(z.object({ keyPackages: z.array(claimedKeyPackageSchema) })) },
      },
      // Each claim uses up a package of every device: no draining someone's supply.
      config: { rateLimit: perUser(30) },
    },
    async (request) => ({
      success: true as const,
      data: {
        keyPackages: await e2eeService.claimKeyPackages(
          requireHuman(request).user.id,
          request.params.userId,
        ),
      },
    }),
  )

  app.post(
    '/channels/:channelId/e2ee/commits',
    {
      schema: { params: z.object({ channelId: snowflakeSchema }), body: postCommitRequestSchema },
      config: { rateLimit: perUser(60) },
    },
    async (request, reply) => {
      await e2eeService.postCommit(
        requireHuman(request).user.id,
        request.params.channelId,
        request.body,
      )
      return reply.status(204).send()
    },
  )

  app.get(
    '/channels/:channelId/e2ee/handshakes',
    {
      schema: {
        params: z.object({ channelId: snowflakeSchema }),
        querystring: listHandshakesQuerySchema,
        response: { 200: ok(z.object({ handshakes: z.array(handshakeSchema) })) },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        handshakes: await e2eeService.listHandshakes(
          requireHuman(request).user.id,
          request.params.channelId,
          request.query.deviceId,
          request.query.after,
        ),
      },
    }),
  )
}
