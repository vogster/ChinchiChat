import { WebhookReceiver } from 'livekit-server-sdk'

import { HttpError } from '../../http/http-error'

import type { VoiceConfig } from '../../config/env'
import type { VoiceService } from './voice.service'
import type { FastifyPluginAsync } from 'fastify'

export interface VoiceWebhookRoutesOptions {
  readonly config: VoiceConfig | undefined
  readonly voiceService: VoiceService
}

/** LiveKit events are small; anything bigger is not from LiveKit. */
const WEBHOOK_BODY_LIMIT = 64 * 1024

const unauthorized = () => new HttpError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature')

/**
 * LiveKit reports joins, leaves and tracks here. The signature covers the exact body, so this
 * plugin keeps its own raw-text parser (encapsulated: the rest of the API still parses JSON).
 */
export const voiceWebhookRoutes: FastifyPluginAsync<VoiceWebhookRoutesOptions> = async (
  app,
  { config, voiceService },
) => {
  if (!config) return
  const receiver = new WebhookReceiver(config.apiKey, config.apiSecret)

  app.addContentTypeParser(
    'application/webhook+json',
    { parseAs: 'string', bodyLimit: WEBHOOK_BODY_LIMIT },
    (_request, body, done) => done(null, body),
  )

  // Generous: one LiveKit sends a burst per join; strangers get cut off after the signature check costs pile up.
  const rateLimit = {
    max: 600,
    timeWindow: 60_000,
    keyGenerator: (r: { ip: string }) => `webhook:${r.ip}`,
  }
  app.post('/voice/webhook', { config: { rateLimit } }, async (request, reply) => {
    const event = await receiver
      .receive(String(request.body ?? ''), request.headers.authorization)
      .catch(() => {
        throw unauthorized()
      })
    await voiceService.handleWebhook(event)
    return reply.status(200).send()
  })
}
