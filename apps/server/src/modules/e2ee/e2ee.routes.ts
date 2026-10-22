import {
  claimedKeyPackageSchema,
  deviceSchema,
  handshakeSchema,
  listHandshakesQuerySchema,
  postCommitRequestSchema,
  registerDeviceRequestSchema,
  setUserKeyRequestSchema,
  signDeviceRequestSchema,
  snowflakeSchema,
  uploadKeyPackagesRequestSchema,
  userKeySchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { FAIL_CLOSED, perUserRateLimit } from '../../http/rate-limit'
import { ok } from '../../http/responses'
import { requireHuman } from '../auth/auth.plugin'

import type { UserRow } from '../users/user.repository'
import type { E2eeService } from './e2ee.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface E2eeRoutesOptions {
  readonly e2eeService: E2eeService
  /** Replacing the user key takes the password and, with 2FA on, a code. */
  readonly confirmIdentity: (
    user: UserRow,
    password: string,
    code: string | undefined,
  ) => Promise<void>
}

const devicesResponse = ok(z.object({ devices: z.array(deviceSchema) }))

export const e2eeRoutes: FastifyPluginAsyncZod<E2eeRoutesOptions> = async (
  app,
  { e2eeService, confirmIdentity },
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
      config: { rateLimit: perUserRateLimit('e2ee', 10) },
    },
    async (request) => ({
      success: true as const,
      data: {
        device: await e2eeService.registerDevice(requireHuman(request).user.id, request.body),
      },
    }),
  )

  const userKeyResponse = ok(z.object({ userKey: userKeySchema.nullable() }))

  app.get(
    '/users/@me/e2ee/user-key',
    { schema: { response: { 200: userKeyResponse } } },
    async (request) => {
      const { user } = requireHuman(request)
      return {
        success: true as const,
        data: { userKey: await e2eeService.getUserKey(user.id, user.id) },
      }
    },
  )

  app.get(
    '/users/:userId/e2ee/user-key',
    {
      schema: {
        params: z.object({ userId: snowflakeSchema }),
        response: { 200: userKeyResponse },
      },
    },
    async (request) => ({
      success: true as const,
      data: {
        userKey: await e2eeService.getUserKey(requireHuman(request).user.id, request.params.userId),
      },
    }),
  )

  app.put(
    '/users/@me/e2ee/user-key',
    {
      schema: {
        body: setUserKeyRequestSchema,
        response: { 200: ok(z.object({ userKey: userKeySchema })) },
      },
      // Checks a password when replacing: fail closed.
      config: { rateLimit: { ...perUserRateLimit('e2ee', 10), ...FAIL_CLOSED } },
    },
    async (request) => {
      const { user } = requireHuman(request)
      const { publicKey, replace, password, code } = request.body
      // A new key makes every device untrusted and lets a new backup wipe the history.
      if (replace) await confirmIdentity(user, password ?? '', code)
      return {
        success: true as const,
        data: { userKey: await e2eeService.setUserKey(user.id, { publicKey, replace }) },
      }
    },
  )

  app.put(
    '/users/@me/devices/:deviceId/signature',
    {
      schema: { params: z.object({ deviceId: snowflakeSchema }), body: signDeviceRequestSchema },
      config: { rateLimit: perUserRateLimit('e2ee', 30) },
    },
    async (request, reply) => {
      await e2eeService.signDevice(
        requireHuman(request).user.id,
        request.params.deviceId,
        request.body.signature,
      )
      return reply.status(204).send()
    },
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
      config: { rateLimit: perUserRateLimit('e2ee', 30) },
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
      config: { rateLimit: perUserRateLimit('e2ee', 30) },
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
      config: { rateLimit: perUserRateLimit('e2ee', 60) },
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
