import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createGatewayClient } from './gateway'

import type { GatewayClientOptions, GatewayState } from './gateway'

/** Minimal stand-in for the browser WebSocket, driven by the test. */
class FakeSocket {
  static instances: FakeSocket[] = []
  /** Answer heartbeats like a healthy server would. */
  static autoAck = true
  readyState = 0
  sent: { op: number; d?: unknown }[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  send(text: string) {
    const frame = JSON.parse(text) as { op: number }
    this.sent.push(frame)
    if (frame.op === 1 && FakeSocket.autoAck) queueMicrotask(() => this.receive({ op: 11 }))
  }

  close(code = 1000) {
    this.readyState = 3
    this.onclose?.({ code })
  }

  // Test helpers
  open() {
    this.readyState = 1
    this.onopen?.()
  }

  receive(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }

  hello(heartbeatInterval = 1000) {
    this.receive({ op: 10, d: { heartbeatInterval, version: 1 } })
  }

  ready(seq = 10, sessionId = 'sess-1') {
    this.receive({
      op: 0,
      t: 'READY',
      s: seq,
      d: { sessionId, user: {}, guilds: [], presences: [], readStates: [] },
    })
  }

  serverClose(code: number) {
    this.readyState = 3
    this.onclose?.({ code })
  }
}

const latest = () => FakeSocket.instances.at(-1) as FakeSocket

const setup = (options: Partial<GatewayClientOptions> = {}) => {
  const dispatches: { type: string; data: unknown }[] = []
  const states: GatewayState[] = []
  const onAuthFailed = vi.fn()
  const client = createGatewayClient({
    url: 'wss://chat.example.com/api/v1/gateway',
    WebSocket: FakeSocket as unknown as GatewayClientOptions['WebSocket'],
    random: () => 0.5,
    onDispatch: (type, data) => dispatches.push({ type, data }),
    onStateChange: (state) => states.push(state),
    onAuthFailed,
    ...options,
  })
  return { client, dispatches, states, onAuthFailed }
}

/** Opens the latest socket and completes HELLO → READY. */
const handshake = (seq = 10) => {
  const socket = latest()
  socket.open()
  socket.hello()
  socket.ready(seq)
  return socket
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.instances = []
  FakeSocket.autoAck = true
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createGatewayClient', () => {
  it('identifies after HELLO and reports READY', () => {
    const { client, dispatches, states } = setup()
    client.connect()
    const socket = latest()
    socket.open()
    socket.hello()

    expect(socket.url).toBe('wss://chat.example.com/api/v1/gateway')
    expect(socket.sent).toEqual([{ op: 2, d: {} }])

    socket.ready()
    expect(dispatches[0]?.type).toBe('READY')
    expect(states).toEqual(['connecting', 'ready'])
  })

  it('sends the token when one is provided (native clients)', () => {
    const { client } = setup({ getToken: () => 'secret' })
    client.connect()
    latest().open()
    latest().hello()

    expect(latest().sent).toEqual([{ op: 2, d: { token: 'secret' } }])
  })

  it('forwards dispatches with their payload', () => {
    const { client, dispatches } = setup()
    client.connect()
    const socket = handshake()

    socket.receive({ op: 0, t: 'MESSAGE_CREATE', s: 11, d: { id: '1' } })

    expect(dispatches.at(-1)).toEqual({ type: 'MESSAGE_CREATE', data: { id: '1' } })
  })

  it('heartbeats with the last sequence number', () => {
    const { client } = setup()
    client.connect()
    const socket = handshake(10)
    socket.receive({ op: 0, t: 'MESSAGE_CREATE', s: 12, d: {} })

    vi.advanceTimersByTime(1000)
    expect(socket.sent.filter((f) => f.op === 1).at(-1)).toEqual({ op: 1, d: 12 })
  })

  it('treats a missing heartbeat ACK as a dead connection and resumes', () => {
    FakeSocket.autoAck = false
    const { client } = setup()
    client.connect()
    const first = handshake(10)

    vi.advanceTimersByTime(1000) // heartbeat sent, never acked
    vi.advanceTimersByTime(1000) // next beat finds no ACK → reconnect
    expect(first.readyState).toBe(3)

    vi.advanceTimersByTime(30_000)
    const second = latest()
    expect(second).not.toBe(first)
    second.open()
    second.hello()
    expect(second.sent[0]).toEqual({ op: 6, d: { sessionId: 'sess-1', seq: 10 } })
  })

  it('resumes after the connection drops, with growing backoff', () => {
    const { client, states } = setup()
    client.connect()
    handshake(10)

    latest().serverClose(1006)
    expect(states.at(-1)).toBe('reconnecting')

    // First retry after base delay × jitter (1000 × 0.75).
    vi.advanceTimersByTime(749)
    expect(FakeSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(2)

    // Fails before opening: second retry waits longer.
    latest().serverClose(1006)
    vi.advanceTimersByTime(1499)
    expect(FakeSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(3)

    latest().open()
    latest().hello()
    expect(latest().sent[0]).toEqual({ op: 6, d: { sessionId: 'sess-1', seq: 10 } })
    latest().receive({ op: 0, t: 'RESUMED', s: 10, d: {} })
    expect(states.at(-1)).toBe('ready')
  })

  it('identifies again when the session cannot be resumed', async () => {
    const { client } = setup()
    client.connect()
    handshake(10)
    latest().serverClose(1006)
    vi.advanceTimersByTime(1000)
    latest().open()
    latest().hello()

    latest().receive({ op: 9, d: false })
    await vi.advanceTimersByTimeAsync(5000)

    const sent = latest().sent
    expect(sent[0]).toMatchObject({ op: 6 })
    expect(sent.slice(1)).toContainEqual({ op: 2, d: {} })
  })

  it('reconnects and resumes when the server asks to', () => {
    const { client } = setup()
    client.connect()
    const socket = handshake(10)

    socket.receive({ op: 7 })
    vi.advanceTimersByTime(30_000)
    latest().open()
    latest().hello()

    expect(latest().sent[0]).toEqual({ op: 6, d: { sessionId: 'sess-1', seq: 10 } })
  })

  it('stops and reports when authentication is rejected', () => {
    const { client, states, onAuthFailed } = setup()
    client.connect()
    handshake()

    latest().serverClose(4004)
    vi.advanceTimersByTime(60_000)

    expect(onAuthFailed).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toBe('closed')
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('updates presence and disconnects on request', () => {
    const { client, states } = setup()
    client.connect()
    const socket = handshake()

    client.setStatus('dnd')
    expect(socket.sent.at(-1)).toEqual({ op: 3, d: { status: 'dnd' } })

    client.disconnect()
    vi.advanceTimersByTime(60_000)
    expect(states.at(-1)).toBe('closed')
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('ignores malformed frames', () => {
    const { client, dispatches } = setup()
    client.connect()
    const socket = handshake()

    socket.onmessage?.({ data: 'not json' })
    expect(dispatches).toHaveLength(1)
  })
})
