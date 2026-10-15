import { describe, expect, it } from 'vitest'

import { HttpError } from './http-error'
import { createLimiter } from './limiter'

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('createLimiter', () => {
  it('runs up to `max` tasks at once and refuses more with 503', async () => {
    const limit = createLimiter(2)
    const gates = [deferred(), deferred()]
    const running = gates.map((gate) => limit(() => gate.promise.then(() => 'done')))

    await expect(limit(async () => 'extra')).rejects.toEqual(
      new HttpError(503, 'SERVER_BUSY', 'The server is busy, try again shortly'),
    )

    for (const gate of gates) gate.resolve()
    await expect(Promise.all(running)).resolves.toEqual(['done', 'done'])
    await expect(limit(async () => 'again')).resolves.toBe('again')
  })

  it('frees the slot when a task fails', async () => {
    const limit = createLimiter(1)
    await expect(limit(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(limit(async () => 'ok')).resolves.toBe('ok')
  })
})
