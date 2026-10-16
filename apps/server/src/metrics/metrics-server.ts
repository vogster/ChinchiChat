import { createServer } from 'node:http'

import type { Registry } from '@prometheus-io/client'
import type { AddressInfo } from 'node:net'

export interface MetricsServer {
  readonly port: number
  close(): Promise<void>
}

/**
 * `/metrics` on a port of its own, never on the public API: it describes the instance's
 * load and internals, so only Prometheus inside the private network should reach it.
 */
export const startMetricsServer = (
  registry: Registry,
  { host, port }: { host: string; port: number },
): Promise<MetricsServer> =>
  new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/metrics') {
        response.writeHead(404).end()
        return
      }
      registry
        .metrics()
        .then((text) => {
          response.writeHead(200, { 'content-type': registry.contentType }).end(text)
        })
        .catch(() => response.writeHead(500).end())
    })
    server.once('error', reject)
    server.listen(port, host, () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          }),
      })
    })
  })
