import { WebSocket } from 'ws'

import { SESSION_COOKIE, WEB_ORIGIN } from './auth-helpers'

import type { FastifyInstance } from 'fastify'

export interface Frame {
  readonly op: number
  readonly t?: string
  readonly s?: number
  readonly d?: unknown
}

export interface TestSocket {
  readonly frames: Frame[]
  send(frame: object): void
  /** Resolves with the first frame (already received or future) matching the predicate. */
  next(predicate: (frame: Frame) => boolean, timeoutMs?: number): Promise<Frame>
  dispatch<T = unknown>(type: string, timeoutMs?: number): Promise<T>
  /** Asserts that no matching frame arrives within the window. */
  none(predicate: (frame: Frame) => boolean, windowMs?: number): Promise<boolean>
  readonly closed: Promise<{ code: number; reason: string }>
  close(): void
}

export interface ConnectOptions {
  readonly cookie?: string | undefined
  readonly origin?: string | null
  /** Like real clients, heartbeat at half the advertised interval (default true). */
  readonly autoHeartbeat?: boolean
}

export const gatewayUrl = (app: FastifyInstance) => {
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('App is not listening')
  return `ws://127.0.0.1:${address.port}/api/v1/gateway`
}

export const connectGateway = (
  app: FastifyInstance,
  { cookie, origin = WEB_ORIGIN, autoHeartbeat = true }: ConnectOptions = {},
): Promise<TestSocket> =>
  new Promise((resolve, reject) => {
    const headers: Record<string, string> = {}
    if (cookie) headers.cookie = `${SESSION_COOKIE}=${cookie}`
    if (origin) headers.origin = origin
    const ws = new WebSocket(gatewayUrl(app), { headers })
    const frames: Frame[] = []
    const waiters = new Set<() => void>()

    let heartbeat: ReturnType<typeof setInterval> | undefined
    let lastSeq: number | null = null

    const closed = new Promise<{ code: number; reason: string }>((resolveClose) => {
      ws.on('close', (code, reason) => {
        clearInterval(heartbeat)
        resolveClose({ code, reason: reason.toString() })
      })
    })

    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as Frame
      frames.push(frame)
      if (typeof frame.s === 'number') lastSeq = frame.s
      if (frame.op === 10 && autoHeartbeat) {
        const interval = (frame.d as { heartbeatInterval: number }).heartbeatInterval
        heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: lastSeq }))
        }, interval / 2)
      }
      for (const wake of waiters) wake()
    })
    ws.on('unexpected-response', (_request, response) =>
      reject(new Error(`HTTP ${response.statusCode}`)),
    )
    ws.on('error', reject)

    const next = (predicate: (frame: Frame) => boolean, timeoutMs = 3000) =>
      new Promise<Frame>((resolveFrame, rejectFrame) => {
        let index = 0
        const check = () => {
          for (; index < frames.length; index += 1) {
            const frame = frames[index] as Frame
            if (predicate(frame)) {
              waiters.delete(check)
              clearTimeout(timer)
              index += 1
              resolveFrame(frame)
              return
            }
          }
        }
        const timer = setTimeout(() => {
          waiters.delete(check)
          rejectFrame(new Error('Timed out waiting for a gateway frame'))
        }, timeoutMs)
        waiters.add(check)
        check()
      })

    ws.on('open', () =>
      resolve({
        frames,
        send: (frame) => ws.send(JSON.stringify(frame)),
        next,
        dispatch: async <T>(type: string, timeoutMs?: number) =>
          (await next((frame) => frame.op === 0 && frame.t === type, timeoutMs)).d as T,
        none: async (predicate, windowMs = 300) => {
          await new Promise((r) => setTimeout(r, windowMs))
          return !frames.some(predicate)
        },
        closed,
        close: () => ws.close(),
      }),
    )
  })

/** Connects and completes the handshake; resolves once READY arrives. */
export const identify = async (
  app: FastifyInstance,
  cookie: string,
  options: Omit<ConnectOptions, 'cookie'> = {},
) => {
  const socket = await connectGateway(app, { ...options, cookie })
  socket.send({ op: 2, d: {} })
  const ready = await socket.next((frame) => frame.t === 'READY')
  return {
    socket,
    ready: ready.d as {
      sessionId: string
      user: { id: string }
      guilds: { id: string }[]
      presences: { userId: string; status: string }[]
      notificationSettings: unknown[]
    },
    readySeq: ready.s as number,
  }
}
