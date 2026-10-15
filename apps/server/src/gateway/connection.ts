import {
  CloseCode,
  GATEWAY_VERSION,
  Opcode,
  dispatchSchemas,
  parseClientMessage,
} from '@chinchi/shared'

import { guildTopic, userTopic } from '../events/event-bus'
import { SESSIONS_REVOKED } from '../events/internal-events'

import type { EventBus, SequencedEvent } from '../events/event-bus'
import type { RevokedSessions } from '../events/internal-events'
import type { AuthContext } from '../modules/auth/auth.service'
import { applyGuildEvent } from './visibility'

import type { Dispatcher, Subscriber } from './dispatcher'
import type { GuildPermissionState } from './visibility'
import type { PresenceService } from './presence'
import type { GatewaySessionStore } from './session-store'
import type {
  ClientMessage,
  CurrentUser,
  GuildDetail,
  PrivateChannel,
  VoiceState,
  MentionCounts,
  Presence,
  CustomStatus,
  NotificationSetting,
  ReadState,
  ServerMessage,
} from '@chinchi/shared'

export interface GatewaySocket {
  send(text: string): void
  close(code: number, reason: string): void
}

export interface ConnectionDeps {
  readonly heartbeatMs: number
  readonly events: EventBus
  readonly dispatcher: Dispatcher
  readonly sessions: GatewaySessionStore
  readonly presence: PresenceService
  readonly authenticate: (token: string) => Promise<AuthContext | null>
  readonly guildIdsFor: (userId: string) => Promise<readonly string[]>
  readonly snapshot: (userId: string) => Promise<{
    guilds: GuildDetail[]
    privateChannels: PrivateChannel[]
    voiceStates: VoiceState[]
    presences: Presence[]
    readStates: ReadState[]
    notificationSettings: NotificationSetting[]
    customStatus: CustomStatus | null
    mentionCounts: MentionCounts
  }>
  readonly toCurrentUser: (auth: AuthContext) => CurrentUser
  /** Everything needed to decide which of a server's events this user may see. */
  readonly loadGuildState: (guildId: string, userId: string) => Promise<GuildPermissionState | null>
  readonly onError: (error: unknown) => void
  /** Counts what is sent (metrics). */
  readonly onDispatch?: (type: string) => void
  /** How long READY took to prepare, in seconds (metrics). */
  readonly onReady?: (seconds: number) => void
}

const FRAME_LIMIT = 120
const FRAME_WINDOW_MS = 60_000

const isRevoked = (revoked: RevokedSessions, sessionId: string): boolean =>
  revoked.scope === 'all' ||
  (revoked.scope === 'allExcept' && revoked.sessionId !== sessionId) ||
  (revoked.scope === 'only' && revoked.sessionIds.includes(sessionId))

/**
 * One gateway connection: HELLO → IDENTIFY/RESUME → READY/RESUMED → dispatches.
 * `cookieAuth` is the session resolved from the upgrade request (browsers); native clients send
 * a token in IDENTIFY/RESUME instead.
 */
export const createConnection = (
  socket: GatewaySocket,
  cookieAuth: AuthContext | null,
  deps: ConnectionDeps,
) => {
  let state: 'connected' | 'starting' | 'ready' | 'closed' = 'connected'
  let auth: AuthContext | null = null
  let gatewaySessionId: string | null = null
  let lastSentSeq = 0
  // Events that arrive while READY/RESUMED is being prepared, flushed right after it.
  let pending: SequencedEvent[] | null = null
  const topics = new Set<string>()
  const guildStates = new Map<string, GuildPermissionState>()
  // Events are handled strictly one after another, even when handling one needs I/O.
  let queue: Promise<void> = Promise.resolve()
  let frames = 0
  let frameWindowStart = Date.now()
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  let identifyTimer: ReturnType<typeof setTimeout> | undefined
  let cleanup: Promise<void> | null = null

  const send = (message: ServerMessage) => socket.send(JSON.stringify(message))

  const close = (code: number, reason: string) => {
    if (state === 'closed') return
    socket.close(code, reason)
  }

  const armHeartbeatDeadline = () => {
    clearTimeout(heartbeatTimer)
    // Some slack over the interval so a slightly late heartbeat is not fatal.
    heartbeatTimer = setTimeout(
      () => close(CloseCode.SessionTimedOut, 'Heartbeat timed out'),
      deps.heartbeatMs * 1.5,
    )
  }

  const subscribe = (topic: string) => {
    topics.add(topic)
    deps.dispatcher.subscribe(subscriber, topic)
  }

  const unsubscribe = (topic: string) => {
    topics.delete(topic)
    deps.dispatcher.unsubscribe(subscriber, topic)
  }

  const unsubscribeAll = () => {
    for (const topic of [...topics]) unsubscribe(topic)
  }

  const releaseSession = async (userId: string, sessionId: string) => {
    await Promise.all([
      deps.sessions.touch(sessionId).catch(deps.onError),
      deps.presence.disconnect(userId, sessionId).catch(deps.onError),
    ])
  }

  const dispatch = (type: string, seq: number, data: unknown) => {
    if (!(type in dispatchSchemas)) return
    deps.onDispatch?.(type)
    send({ op: Opcode.Dispatch, t: type as keyof typeof dispatchSchemas, s: seq, d: data })
  }

  const loadGuild = async (guildId: string, userId: string) => {
    const loaded = await deps.loadGuildState(guildId, userId)
    if (loaded) guildStates.set(guildId, loaded)
  }

  const forgetGuild = (guildId: string) => {
    unsubscribe(guildTopic(guildId))
    guildStates.delete(guildId)
  }

  const handleEvent = async (event: SequencedEvent) => {
    if (event.seq <= lastSentSeq || !auth || state === 'closed') return
    lastSentSeq = event.seq
    const userId = auth.user.id

    if (event.type === SESSIONS_REVOKED) {
      if (isRevoked(event.data as RevokedSessions, auth.session.id)) {
        close(CloseCode.AuthenticationFailed, 'Session revoked')
      }
      return
    }

    const data = event.data as { id?: string }
    if (event.topic === userTopic(userId)) {
      // Keep subscriptions and permission state in step with membership.
      if (event.type === 'GUILD_CREATE' && data.id) {
        subscribe(guildTopic(data.id))
        await loadGuild(data.id, userId)
      }
      if (event.type === 'GUILD_DELETE' && data.id) forgetGuild(data.id)
      dispatch(event.type, event.seq, event.data)
      return
    }

    const guildId = event.topic.slice('guild:'.length)
    if (event.type === 'GUILD_DELETE') {
      forgetGuild(guildId)
      dispatch(event.type, event.seq, event.data)
      return
    }
    const guildState = guildStates.get(guildId)
    if (!guildState) return
    // Only what this user may see, plus channels appearing/disappearing as permissions change.
    const applied = applyGuildEvent(
      guildState,
      userId,
      event.type as keyof typeof dispatchSchemas,
      event.data,
    )
    guildStates.set(guildId, applied.state)
    for (const output of applied.outputs) dispatch(output.type, event.seq, output.data)
  }

  const enqueue = (event: SequencedEvent) => {
    queue = queue.then(() => handleEvent(event)).catch(deps.onError)
  }

  const subscriber: Subscriber = {
    deliver(event) {
      if (state === 'closed') return
      if (pending) pending.push(event)
      else if (state === 'ready') enqueue(event)
    },
  }

  const flushPending = () => {
    const queued = pending ?? []
    pending = null
    for (const event of queued) enqueue(event)
  }

  /** Subscribes to the user's own topic and every server they are in, loading permissions. */
  const subscribeAll = async (userId: string) => {
    subscribe(userTopic(userId))
    const guildIds = await deps.guildIdsFor(userId)
    for (const guildId of guildIds) subscribe(guildTopic(guildId))
    await Promise.all(guildIds.map((guildId) => loadGuild(guildId, userId)))
  }

  const resolveAuth = async (token: string | undefined) =>
    token ? deps.authenticate(token) : cookieAuth

  const begin = async (token: string | undefined): Promise<AuthContext | null> => {
    if (state !== 'connected') {
      close(CloseCode.AlreadyAuthenticated, 'Already authenticated')
      return null
    }
    state = 'starting'
    const resolved = await resolveAuth(token)
    if (!resolved) {
      close(CloseCode.AuthenticationFailed, 'Authentication failed')
      return null
    }
    return resolved
  }

  const identify = async (token: string | undefined) => {
    const started = performance.now()
    const resolved = await begin(token)
    if (!resolved) return
    auth = resolved
    clearTimeout(identifyTimer)
    armHeartbeatDeadline()

    // Order matters: subscribe first, then take the position, then the snapshot. Anything newer
    // than the position arrives live; anything older is already in the snapshot.
    pending = []
    await subscribeAll(resolved.user.id)
    const readySeq = await deps.events.latestSeq()
    gatewaySessionId = await deps.sessions.create(resolved.user.id, readySeq)
    // Come online before the snapshot so READY already shows this user's own status.
    await deps.presence.connect(resolved.user.id, gatewaySessionId)
    const {
      guilds,
      privateChannels,
      voiceStates,
      presences,
      readStates,
      notificationSettings,
      customStatus,
      mentionCounts,
    } = await deps.snapshot(resolved.user.id)

    lastSentSeq = readySeq
    deps.onDispatch?.('READY')
    deps.onReady?.((performance.now() - started) / 1000)
    send({
      op: Opcode.Dispatch,
      t: 'READY',
      s: readySeq,
      d: {
        sessionId: gatewaySessionId,
        user: deps.toCurrentUser(resolved),
        guilds,
        privateChannels,
        voiceStates,
        presences,
        readStates,
        notificationSettings,
        customStatus,
        mentionCounts,
      },
    })
    state = 'ready'
    flushPending()
  }

  const resume = async ({
    sessionId,
    seq,
    token,
  }: {
    sessionId: string
    seq: number
    token?: string | undefined
  }) => {
    const resolved = await begin(token)
    if (!resolved) return

    const invalid = () => {
      unsubscribeAll()
      guildStates.clear()
      pending = null
      state = 'connected'
      send({ op: Opcode.InvalidSession, d: false })
    }

    // Only this user's session, and nothing from before it began (or before what it confirmed).
    const session = await deps.sessions.get(sessionId)
    if (!session || session.userId !== resolved.user.id || seq < session.floor) return invalid()

    pending = []
    await subscribeAll(resolved.user.id)
    const missed = await deps.events.replay(seq)
    if (!missed) return invalid()

    auth = resolved
    gatewaySessionId = sessionId
    lastSentSeq = seq
    clearTimeout(identifyTimer)
    armHeartbeatDeadline()

    // Replay in order; membership events inside the replay update `topics` as they go.
    for (const event of missed) if (topics.has(event.topic)) await handleEvent(event)
    await deps.sessions.touch(sessionId, seq)
    await deps.presence.connect(resolved.user.id, sessionId)

    deps.onDispatch?.('RESUMED')
    send({ op: Opcode.Dispatch, t: 'RESUMED', s: lastSentSeq, d: {} })
    state = 'ready'
    flushPending()
  }

  const heartbeat = async (seen: number | null) => {
    send({ op: Opcode.HeartbeatAck })
    if (state !== 'ready' || !auth || !gatewaySessionId) return
    armHeartbeatDeadline()
    // What the client confirms (never beyond what was sent) becomes the new resume floor.
    await deps.sessions.touch(
      gatewaySessionId,
      seen === null ? undefined : Math.min(seen, lastSentSeq),
    )
    await deps.presence.refresh(auth.user.id, gatewaySessionId)
  }

  const handle = async (message: ClientMessage) => {
    switch (message.op) {
      case Opcode.Heartbeat:
        return heartbeat(message.d)
      case Opcode.Identify:
        return identify(message.d.token)
      case Opcode.Resume:
        return resume(message.d)
      case Opcode.PresenceUpdate:
        if (state === 'ready' && auth) await deps.presence.setStatus(auth.user.id, message.d.status)
        return undefined
    }
  }

  const overFrameLimit = () => {
    const now = Date.now()
    if (now - frameWindowStart > FRAME_WINDOW_MS) {
      frameWindowStart = now
      frames = 0
    }
    frames += 1
    return frames > FRAME_LIMIT
  }

  return {
    start() {
      send({
        op: Opcode.Hello,
        d: { heartbeatInterval: deps.heartbeatMs, version: GATEWAY_VERSION },
      })
      identifyTimer = setTimeout(
        () => close(CloseCode.NotAuthenticated, 'Identify timed out'),
        deps.heartbeatMs,
      )
    },

    receive(raw: string) {
      if (state === 'closed') return
      if (overFrameLimit()) return close(CloseCode.RateLimited, 'Too many frames')
      const parsed = parseClientMessage(raw)
      if (!parsed.ok) return close(CloseCode.DecodeError, 'Invalid frame')
      handle(parsed.message).catch((error: unknown) => {
        deps.onError(error)
        close(CloseCode.UnknownError, 'Internal error')
      })
    },

    /** Server shutdown: ask the client to reconnect (and resume) elsewhere. */
    requestReconnect() {
      send({ op: Opcode.Reconnect })
      close(1012, 'Server restarting')
    },

    /**
     * Stops the connection and releases its session and presence. Idempotent: every call
     * returns the same promise, which settles once cleanup is done and never rejects.
     */
    onClose(): Promise<void> {
      if (cleanup) return cleanup
      const wasReady = state === 'ready'
      state = 'closed'
      clearTimeout(heartbeatTimer)
      clearTimeout(identifyTimer)
      unsubscribeAll()
      cleanup =
        wasReady && auth && gatewaySessionId
          ? releaseSession(auth.user.id, gatewaySessionId)
          : Promise.resolve()
      return cleanup
    },
  }
}

export type GatewayConnection = ReturnType<typeof createConnection>
