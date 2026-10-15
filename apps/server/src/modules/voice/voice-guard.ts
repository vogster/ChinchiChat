import { SESSIONS_REVOKED } from '../../events/internal-events'

import type { EventBus, SequencedEvent } from '../../events/event-bus'
import type { VoiceService } from './voice.service'
import type { FastifyBaseLogger } from 'fastify'

export interface VoiceGuardDeps {
  readonly events: EventBus
  readonly voice: Pick<
    VoiceService,
    'revalidate' | 'revalidateGuild' | 'reconcile' | 'disconnectUser'
  >
  readonly log: FastifyBaseLogger
  /** How often recorded connections are checked against LiveKit; 0 turns it off (tests). */
  readonly reconcileEveryMs: number
}

const userOfTopic = (topic: string) => (topic.startsWith('user:') ? topic.slice(5) : null)

/**
 * Keeps calls in step with access: whatever can take a right away (leaving or losing a server,
 * roles, channel overwrites, blocks, leaving a group DM) re-checks the people in voice, who are
 * disconnected or get their rights trimmed. Each server process reacts to every event; the
 * resulting LiveKit calls are idempotent.
 */
export const createVoiceGuard = ({ events, voice, log, reconcileEveryMs }: VoiceGuardDeps) => {
  const react = async ({ type, topic, data }: SequencedEvent) => {
    const payload = data as Record<string, unknown>
    switch (type) {
      case 'GUILD_MEMBER_REMOVE':
      case 'GUILD_MEMBER_UPDATE':
        return voice.revalidate(payload.userId as string)
      case 'GUILD_ROLE_UPDATE':
      case 'GUILD_ROLE_DELETE':
      case 'CHANNEL_UPDATE':
        return voice.revalidateGuild(payload.guildId as string)
      // A new owner: the former one keeps only what their roles give them.
      case 'GUILD_UPDATE':
      case 'GUILD_DELETE':
        return voice.revalidateGuild(payload.id as string)
      // Every session ended (suspension, password reset): calls end too.
      case SESSIONS_REVOKED: {
        const userId = userOfTopic(topic)
        if (userId && payload.scope === 'all') await voice.disconnectUser(userId)
        return
      }
      // Blocks and unfriending change who may call whom; leaving a group DM ends its call.
      case 'RELATIONSHIP_ADD':
      case 'RELATIONSHIP_REMOVE':
      case 'PRIVATE_CHANNEL_DELETE': {
        const userId = userOfTopic(topic)
        const other =
          type === 'RELATIONSHIP_ADD'
            ? (payload.user as { id: string }).id
            : type === 'RELATIONSHIP_REMOVE'
              ? (payload.userId as string)
              : null
        await Promise.all(
          [userId, other].filter((id): id is string => id !== null).map(voice.revalidate),
        )
      }
    }
  }

  let unsubscribe: (() => void) | null = null
  let timer: NodeJS.Timeout | null = null
  const reconcile = () =>
    voice.reconcile().catch((error: unknown) => log.warn({ err: error }, 'voice reconcile failed'))

  return {
    start() {
      unsubscribe = events.onEvent((event) => {
        react(event).catch((error: unknown) =>
          log.warn({ err: error, type: event.type }, 'voice revalidation failed'),
        )
      })
      if (reconcileEveryMs > 0) {
        void reconcile()
        timer = setInterval(() => void reconcile(), reconcileEveryMs)
        timer.unref()
      }
    },
    stop() {
      unsubscribe?.()
      unsubscribe = null
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
