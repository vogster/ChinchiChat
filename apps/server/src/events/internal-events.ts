import { userTopic } from './event-bus'

import type { EventBus } from './event-bus'

/** Auth sessions were revoked; gateway connections using them must close. Never sent to clients. */
export const SESSIONS_REVOKED = 'SESSIONS_REVOKED'

export type RevokedSessions =
  | { readonly scope: 'only'; readonly sessionIds: readonly string[] }
  | { readonly scope: 'allExcept'; readonly sessionId: string }
  | { readonly scope: 'all' }

export const publishRevokedSessions = (
  events: EventBus,
  userId: string,
  revoked: RevokedSessions,
) => events.publish({ topic: userTopic(userId), type: SESSIONS_REVOKED, data: revoked })
