import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

import { HttpError } from './http-error'

import type { FastifyError, FastifyInstance } from 'fastify'

interface ValidationDetail {
  readonly path: string
  readonly message: string
}

const toPath = (instancePath: string): string =>
  instancePath.replace(/^\//, '').replaceAll('/', '.')

const statusOf = (error: FastifyError): number =>
  error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500

/** Stable codes for framework errors that clients want to tell apart. */
const FRAMEWORK_CODES: Readonly<Record<number, string>> = {
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
}

export const registerErrorHandlers = (app: FastifyInstance): void => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: ValidationDetail[] = error.validation.map((issue) => ({
        path: toPath(issue.instancePath),
        message: issue.message ?? 'Invalid value',
      }))
      return reply
        .status(400)
        .send({ success: false, code: 'VALIDATION_FAILED', error: 'Validation failed', details })
    }

    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ success: false, code: error.code, error: error.message })
    }

    const status = statusOf(error)
    if (status >= 500) {
      request.log.error({ err: error }, 'Unhandled error')
      return reply
        .status(status)
        .send({ success: false, code: 'INTERNAL', error: 'Internal Server Error' })
    }

    // Framework errors (bad JSON, unsupported media type, ...) are safe to describe.
    return reply.status(status).send({
      success: false,
      code: FRAMEWORK_CODES[status] ?? 'BAD_REQUEST',
      error: error.message,
    })
  })

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      success: false,
      code: 'NOT_FOUND',
      error: `Route ${request.method} ${request.url} not found`,
    }),
  )
}
