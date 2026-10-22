const localLocks = new Map<string, Promise<unknown>>()

/**
 * Runs `task` alone across this browser's tabs and clients (Web Locks), or at least across
 * this page where the API is missing: two clients must not each register a device.
 */
export const exclusively = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(name, task)
  }
  const run = (localLocks.get(name) ?? Promise.resolve()).then(task, task)
  localLocks.set(
    name,
    run.catch(() => undefined),
  )
  return run
}
