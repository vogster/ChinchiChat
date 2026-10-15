/* global open, __ENV, __VU */
// Load test: every seeded user holds a gateway connection; one member per server posts a
// message every SEND_EVERY_MS, and everyone measures how long it took to reach them.
// Run with `pnpm load` (see load/README in PLAN.md §4.9): k6 in Docker against :3100.
import http from 'k6/http'
import ws from 'k6/ws'
import { SharedArray } from 'k6/data'
import { Counter, Trend } from 'k6/metrics'
import { sleep } from 'k6'

const users = new SharedArray('users', () => JSON.parse(open('/data/users.json')))

const BASE = __ENV.BASE ?? 'host.docker.internal:3100'
const RAMP_S = Number(__ENV.RAMP_S ?? 120)
const HOLD_S = Number(__ENV.HOLD_S ?? 180)
const SEND_EVERY_MS = Number(__ENV.SEND_EVERY_MS ?? 5000)

/** Time from posting a message to its MESSAGE_CREATE reaching a member. */
const delivery = new Trend('delivery_ms', true)
const ready = new Trend('ready_ms', true)
const sent = new Counter('messages_sent')
const failedSends = new Counter('messages_failed')

export const options = {
  scenarios: {
    gateway: {
      executor: 'per-vu-iterations',
      vus: users.length,
      iterations: 1,
      maxDuration: `${RAMP_S + HOLD_S + 120}s`,
    },
  },
  thresholds: {
    delivery_ms: ['p(95)<150'],
    ready_ms: ['p(95)<2000'],
    messages_failed: ['count<10'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const post = (user) => {
  const response = http.post(
    `http://${BASE}/api/v1/channels/${user.channelId}/messages`,
    JSON.stringify({ content: `load:${Date.now()}` }),
    { headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` } },
  )
  if (response.status === 201) sent.add(1)
  else failedSends.add(1, { status: String(response.status) })
}

export default function () {
  const user = users[__VU - 1]
  // Connections arrive spread over the ramp, as people come online, not all at once.
  const delay = (RAMP_S * (__VU - 1)) / users.length
  sleep(delay)
  const started = Date.now()

  ws.connect(`ws://${BASE}/api/v1/gateway`, {}, (socket) => {
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw)
      if (frame.op === 10) {
        socket.send(JSON.stringify({ op: 2, d: { token: user.token } }))
        socket.setInterval(
          () => socket.send(JSON.stringify({ op: 1, d: null })),
          frame.d.heartbeatInterval,
        )
      } else if (frame.op === 0 && frame.t === 'READY') {
        ready.add(Date.now() - started)
        // Senders start once everyone is connected, so the measure is the steady state.
        if (user.sender) {
          socket.setTimeout(
            () => socket.setInterval(() => post(user), SEND_EVERY_MS),
            (RAMP_S - delay) * 1000 + Math.random() * SEND_EVERY_MS,
          )
        }
      } else if (frame.op === 0 && frame.t === 'MESSAGE_CREATE') {
        const match = /^load:(\d+)$/.exec(frame.d.content)
        if (match) delivery.add(Date.now() - Number(match[1]))
      }
    })
    socket.setTimeout(() => socket.close(), (RAMP_S - delay + HOLD_S) * 1000)
  })
}
