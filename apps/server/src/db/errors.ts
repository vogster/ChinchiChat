const UNIQUE_VIOLATION = '23505'

interface PostgresErrorLike {
  readonly code?: unknown
  readonly constraint_name?: unknown
  readonly cause?: unknown
}

/**
 * Returns the violated constraint name for a unique violation, or null.
 * Drizzle wraps driver errors, so the postgres.js error may sit in `cause`.
 */
export const uniqueViolationConstraint = (error: unknown): string | null => {
  let current: unknown = error
  for (let depth = 0; depth < 3 && current; depth += 1) {
    const candidate = current as PostgresErrorLike
    if (candidate.code === UNIQUE_VIOLATION && typeof candidate.constraint_name === 'string') {
      return candidate.constraint_name
    }
    current = candidate.cause
  }
  return null
}
