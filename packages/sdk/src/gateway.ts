import { CloseCode, Opcode } from '@chinchi/shared'

import type { DispatchType, SelectableStatus } from '@chinchi/shared'

export type GatewayState = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'closed'

/** The subset of the WebSocket API the client needs (browser, React Native, or `ws`). */
export interface SocketLike {
  readonly readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  send(data: string): void
  close(code?: number): void
}

export interface GatewayClientOptions {
  readonly url: string
  readonly WebSocket?: new (url: string) => SocketLike
  /** Native clients authenticate with a token; browsers rely on the session cookie. */
  readonly getToken?: () => string | null | undefined
  readonly onDispatch: (type: DispatchType, data: unknown) => void
  readonly onStateChange?: (state: GatewayState) => void
  /** The session was rejected (logged out elsewhere, revoked): sign the user out. */
  readonly onAuthFailed?: () => void
  readonly random?: () => number
  readonly reconnectBaseMs?: number
  readonly reconnectMaxMs?: number
}

interface Frame {
  readonly op: number
  readonly t?: DispatchType
  readonly s?: number
  readonly d?: unknown
}

const OPEN = 1

const parseFrame = (data: unknown): Frame | null => {
  if (typeof data !== 'string') return null
  try {
    const frame = JSON.parse(data) as Frame
    return typeof frame.op === 'number' ? frame : null
  } catch {
    return null
  }
}

/**
 * Realtime connection with heartbeats, resume after drops, and exponential backoff.
 * Dispatches are handed to `onDispatch` in order; the app decides what they mean.
 */
export const createGatewayClient = ({
  url,
  WebSocket: Socket = globalThis.WebSocket as unknown as new (url: string) => SocketLike,
  getToken,
  onDispatch,
  onStateChange,
  onAuthFailed,
  random = Math.random,
  reconnectBaseMs = 1000,
  reconnectMaxMs = 30_000,
}: GatewayClientOptions) => {
  let socket: SocketLike | null = null
  let state: GatewayState = 'idle'
  let sessionId: string | null = null
  let seq: number | null = null
  let attempt = 0
  let acked = true
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let identifyTimer: ReturnType<typeof setTimeout> | undefined

  const setState = (next: GatewayState) => {
    if (next === state) return
    state = next
    onStateChange?.(next)
  }

  const send = (frame: object) => {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(frame))
  }

  const tokenField = () => {
    const token = getToken?.()
    return token ? { token } : {}
  }

  const identify = () => send({ op: Opcode.Identify, d: tokenField() })

  const stopTimers = () => {
    clearTimeout(heartbeatTimer)
    clearTimeout(identifyTimer)
  }

  /** Detaches and closes the current socket without triggering our own close handling. */
  const dropSocket = (code: number) => {
    stopTimers()
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    if (socket.readyState === OPEN || socket.readyState === 0) socket.close(code)
    socket = null
  }

  const scheduleReconnect = () => {
    setState('reconnecting')
    const delay = Math.min(reconnectMaxMs, reconnectBaseMs * 2 ** attempt) * (0.5 + random() * 0.5)
    attempt += 1
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(open, delay)
  }

  const reconnect = (code = 4000) => {
    dropSocket(code)
    scheduleReconnect()
  }

  const startHeartbeat = (interval: number) => {
    acked = true
    const beat = () => {
      if (!acked) {
        // No ACK since the last beat: the connection is a zombie.
        reconnect()
        return
      }
      acked = false
      send({ op: Opcode.Heartbeat, d: seq })
      heartbeatTimer = setTimeout(beat, interval)
    }
    // Jitter the first beat so reconnecting clients don't heartbeat in lockstep.
    heartbeatTimer = setTimeout(beat, interval * random())
  }

  const handleFrame = (frame: Frame) => {
    if (typeof frame.s === 'number') seq = frame.s

    switch (frame.op) {
      case Opcode.Hello: {
        startHeartbeat((frame.d as { heartbeatInterval: number }).heartbeatInterval)
        if (sessionId !== null && seq !== null) {
          send({ op: Opcode.Resume, d: { sessionId, seq, ...tokenField() } })
        } else {
          identify()
        }
        return
      }
      case Opcode.HeartbeatAck:
        acked = true
        return
      case Opcode.Reconnect:
        reconnect()
        return
      case Opcode.InvalidSession:
        sessionId = null
        seq = null
        // Wait a little before identifying again, as the server may be overloaded.
        identifyTimer = setTimeout(identify, 1000 + random() * 4000)
        return
      case Opcode.Dispatch: {
        if (!frame.t) return
        if (frame.t === 'READY') sessionId = (frame.d as { sessionId: string }).sessionId
        if (frame.t === 'READY' || frame.t === 'RESUMED') {
          attempt = 0
          setState('ready')
        }
        onDispatch(frame.t, frame.d)
        return
      }
    }
  }

  function open() {
    dropSocket(1000)
    if (state !== 'reconnecting') setState('connecting')
    const current = new Socket(url)
    socket = current
    current.onmessage = (event) => {
      const frame = parseFrame(event.data)
      if (frame) handleFrame(frame)
    }
    current.onclose = (event) => {
      socket = null
      stopTimers()
      if (event.code === CloseCode.AuthenticationFailed) {
        sessionId = null
        setState('closed')
        onAuthFailed?.()
        return
      }
      scheduleReconnect()
    }
  }

  return {
    connect() {
      if (state !== 'idle' && state !== 'closed') return
      attempt = 0
      open()
    },

    disconnect() {
      clearTimeout(reconnectTimer)
      dropSocket(1000)
      sessionId = null
      seq = null
      setState('closed')
    },

    setStatus(status: SelectableStatus) {
      send({ op: Opcode.PresenceUpdate, d: { status } })
    },

    get state() {
      return state
    },
  }
}

export type GatewayClient = ReturnType<typeof createGatewayClient>
