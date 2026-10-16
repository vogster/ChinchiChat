import {
  backupEntrySchema,
  createKeyBackupRequestSchema,
  keyBackupSchema,
  listBackupEntriesQuerySchema,
  uploadBackupEntriesRequestSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { perUserRateLimit } from '../../http/rate-limit'
import { ok } from '../../http/responses'
import { requireHuman } from '../auth/auth.plugin'

import type { BackupService } from './backup.service'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface BackupRoutesOptions {
  readonly backupService: BackupService
}

export const backupRoutes: FastifyPluginAsyncZod<BackupRoutesOptions> = async (
  app,
  { backupService },
) => {
  app.get(
    '/users/@me/e2ee/backup',
    { schema: { response: { 200: ok(z.object({ backup: keyBackupSchema.nullable() })) } } },
    async (request) => ({
      success: true as const,
      data: { backup: await backupService.get(requireHuman(request).user.id) },
    }),
  )

  app.put(
    '/users/@me/e2ee/backup',
    {
      schema: {
        body: createKeyBackupRequestSchema,
        response: { 200: ok(z.object({ backup: keyBackupSchema })) },
      },
      config: { rateLimit: perUserRateLimit('backup', 10) },
    },
    async (request) => ({
      success: true as const,
      data: { backup: await backupService.create(requireHuman(request).user.id, request.body) },
    }),
  )

  app.post(
    '/users/@me/e2ee/backup/entries',
    {
      schema: { body: uploadBackupEntriesRequestSchema },
      config: { rateLimit: perUserRateLimit('backup', 120) },
    },
    async (request, reply) => {
      await backupService.putEntries(requireHuman(request).user.id, request.body)
      return reply.status(204).send()
    },
  )

  app.get(
    '/users/@me/e2ee/backup/entries',
    {
      schema: {
        querystring: listBackupEntriesQuerySchema,
        response: { 200: ok(z.object({ entries: z.array(backupEntrySchema) })) },
      },
    },
    async (request) => {
      const { channelId, after, limit } = request.query
      return {
        success: true as const,
        data: {
          entries: await backupService.listEntries(
            requireHuman(request).user.id,
            channelId,
            after,
            limit,
          ),
        },
      }
    },
  )
}
