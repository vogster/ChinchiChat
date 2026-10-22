import { CloseCode, Opcode } from '@chinchi/shared'
import { describe, expect, it } from 'vitest'

import { createConnection, MAX_BUFFERED_BYTES } from './connection'

import type { ConnectionDeps, GatewaySocket } from './connection'

const fakeSocket = () => {
  const sent: string[] = []
  const closed: { code: number; reason: string }[] = []
  let buffered = 0
  const socket: GatewaySocket = {
    send: (text) => sent.push(text),
    close: (code, reason) => closed.push({ code, reason }),
    bufferedAmount: () => buffered,
  }
  return {
    socket,
    sent,
    closed,
    setBuffered: (bytes: number) => {
      buffered = bytes
    },
  }
}

const deps = { heartbeatMs: 60_000 } as unknown as ConnectionDeps
const heartbeat = JSON.stringify({ op: Opcode.Heartbeat, d: null })

describe('a gateway connection whose client stopped reading', () => {
  it('is closed instead of buffering without end', () => {
    const { socket, sent, closed, setBuffered } = fakeSocket()
    const connection = createConnection(socket, null, deps)
    connection.start()

    setBuffered(MAX_BUFFERED_BYTES)
    connection.receive(heartbeat)
    expect(closed).toEqual([])

    setBuffered(MAX_BUFFERED_BYTES + 1)
    const before = sent.length
    connection.receive(heartbeat)
    expect(sent.length).toBe(before)
    expect(closed).toEqual([{ code: CloseCode.SlowConsumer, reason: 'Too slow to read' }])
    void connection.onClose()
  })
})
