import websocket from '@fastify/websocket'
import fp from 'fastify-plugin'

import { SESSION_COOKIE } from '../modules/auth/auth.plugin'
import { createConnection } from './connection'

import type { Metrics } from '../metrics/metrics'
import type { ConnectionDeps, GatewayConnection } from './connection'
import type { Dispatcher } from './dispatcher'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface GatewayOptions {
  readonly path: string
  readonly webOrigins: readonly string[]
  readonly dispatcher: Dispatcher
  readonly deps: Omit<ConnectionDeps, 'onError' | 'dispatcher'>
  readonly metrics?: Pick<Metrics, 'gatewayConnections'>
}

/**
 * Browsers attach cookies to WebSocket upgrades from any site, so a cookie-authenticated
 * upgrade must come from an allowed origin (cross-site WebSocket hijacking). Without a cookie
 * the origin does not matter: desktop shells connect from an origin of their own
 * (tauri://localhost) and must still put a token into IDENTIFY.
 */
const checkOrigin =
  (webOrigins: readonly string[]) => async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin
    const hasCookie = Boolean(request.cookies[SESSION_COOKIE])
    if (hasCookie && (origin === undefined || !webOrigins.includes(origin))) {
      return reply
        .status(403)
        .send({ success: false, code: 'CSRF_ORIGIN_MISMATCH', error: 'Origin not allowed' })
    }
    return undefined
  }

export const gatewayPlugin = fp<GatewayOptions>(
  async (app, { path, webOrigins, dispatcher, deps, metrics }) => {
    await app.register(websocket, { options: { maxPayload: 8 * 1024 } })
    const connections = new Set<GatewayConnection>()

    // Release sessions and presence while Valkey/Postgres are still open: whoever closes the
    // app shuts those down right after `app.close()` resolves.
    app.addHook('onClose', async () => {
      const open = [...connections]
      for (const connection of open) connection.requestReconnect()
      await Promise.all(open.map((connection) => connection.onClose()))
      dispatcher.close()
    })

    app.get(
      path,
      { websocket: true, preValidation: checkOrigin(webOrigins) },
      (socket, request) => {
        const cookieAuth = request.authMethod === 'cookie' ? request.auth : null
        const connection = createConnection(
          {
            send: (text) => socket.send(text),
            close: (code, reason) => socket.close(code, reason),
          },
          cookieAuth,
          {
            ...deps,
            dispatcher,
            onError: (error) => request.log.error({ err: error }, 'Gateway error'),
          },
        )
        connections.add(connection)
        metrics?.gatewayConnections.inc()
        socket.on('message', (raw: Buffer) => connection.receive(raw.toString()))
        // Stays in `connections` until cleanup settles, so shutdown can wait for it.
        socket.on('close', () => {
          void connection.onClose().finally(() => {
            connections.delete(connection)
            metrics?.gatewayConnections.dec()
          })
        })
        connection.start()
      },
    )
  },
  { name: 'chinchi-gateway', dependencies: ['auth'] },
)
