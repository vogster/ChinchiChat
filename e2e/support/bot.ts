const API = 'http://localhost:3100'

interface Dispatch {
  readonly t: string
  readonly d: unknown
}

/**
 * A bot program in miniature: signs in to the gateway with its token and hands out the
 * dispatches it receives. Node's WebSocket sends no Origin, as a native client wouldn't.
 */
export const connectBot = (token: string) =>
  new Promise<{ next: (type: string) => Promise<unknown>; close: () => void }>(
    (resolve, reject) => {
      const socket = new WebSocket(`${API.replace('http', 'ws')}/api/v1/gateway`)
      const seen: Dispatch[] = []
      const waiting: { type: string; resolve: (data: unknown) => void }[] = []
      let beat: ReturnType<typeof setInterval> | undefined
      const bot = {
        next: (type: string) =>
          new Promise<unknown>((found) => {
            const index = seen.findIndex((d) => d.t === type)
            if (index >= 0) found(seen.splice(index, 1)[0]?.d)
            else waiting.push({ type, resolve: found })
          }),
        close: () => {
          clearInterval(beat)
          socket.close()
        },
      }
      socket.onerror = () => reject(new Error('Bot gateway connection failed'))
      socket.onmessage = (event) => {
        const frame = JSON.parse(String(event.data)) as {
          op: number
          t?: string
          d?: { heartbeatInterval?: number }
        }
        if (frame.op === 10) {
          socket.send(JSON.stringify({ op: 2, d: { token } }))
          beat = setInterval(
            () => socket.send(JSON.stringify({ op: 1, d: null })),
            frame.d?.heartbeatInterval ?? 30_000,
          )
          return
        }
        if (frame.op !== 0 || !frame.t) return
        if (frame.t === 'READY') resolve(bot)
        const index = waiting.findIndex((w) => w.type === frame.t)
        if (index >= 0) waiting.splice(index, 1)[0]?.resolve(frame.d)
        else seen.push({ t: frame.t, d: frame.d })
      }
    },
  )

export const apiUrl = (path: string) => `${API}/api/v1${path}`
