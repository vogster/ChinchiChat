import type { Config } from './config/env'
import type { FastifyServerOptions } from 'fastify'

/** Webhook, interaction and export download URLs hold a secret: keep it out of the logs. */
export const redactUrl = (url: string): string =>
  url
    .replace(/(\/(?:webhooks|interactions)\/\d+\/)[^/?#]+/, '$1[redacted]')
    .replace(/(\/users\/@me\/export\/)[^/?#]+/, '$1[redacted]')

const serializers = {
  req: (request: { method: string; url: string; ip?: string }) => ({
    method: request.method,
    url: redactUrl(request.url),
    remoteAddress: request.ip,
  }),
}

export const loggerOptions = (config: Config): FastifyServerOptions['logger'] => {
  if (config.env === 'development') {
    return {
      level: config.logLevel,
      serializers,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    }
  }
  return {
    level: config.logLevel,
    serializers,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  }
}
