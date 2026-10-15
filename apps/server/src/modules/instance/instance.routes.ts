import { instanceInfoSchema } from '@chinchi/shared'
import { z } from 'zod'

import type { InstanceInfo } from '@chinchi/shared'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'

export interface InstanceRoutesOptions {
  /** Read per request: admins may change registration at any time. */
  readonly instance: () => Promise<InstanceInfo>
}

const instanceResponse = z.object({
  success: z.literal(true),
  data: z.object({ instance: instanceInfoSchema }),
})

export const instanceRoutes: FastifyPluginAsyncZod<InstanceRoutesOptions> = async (
  app,
  { instance },
) => {
  app.get('/instance', { schema: { response: { 200: instanceResponse } } }, async () => ({
    success: true as const,
    data: { instance: await instance() },
  }))
}
