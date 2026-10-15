import { HttpError } from './http-error'

/**
 * Caps how many expensive tasks (image decoding) run at once in this process. Excess work is
 * refused at once rather than queued, so a burst cannot pile up memory.
 */
export const createLimiter = (max: number) => {
  let active = 0
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      throw new HttpError(503, 'SERVER_BUSY', 'The server is busy, try again shortly')
    }
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
    }
  }
}
