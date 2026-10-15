import type { FastifyInstance } from 'fastify'

/**
 * Accepts an empty body with `Content-Type: application/json` (common for bodiless POSTs from
 * fetch wrappers) instead of rejecting it. Non-empty bodies go through Fastify's default parser,
 * which keeps its protection against `__proto__`/`constructor` prototype poisoning.
 */
export const registerJsonParser = (app: FastifyInstance): void => {
  const defaultParser = app.getDefaultJsonParser('error', 'error')

  app.removeContentTypeParser('application/json')
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    // `parseAs: 'string'` guarantees a string; the union type comes from the generic signature.
    const text = body.toString()
    if (text === '') {
      done(null, undefined)
      return
    }
    defaultParser(request, text, done)
  })
}
