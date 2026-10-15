import { z } from 'zod'

/**
 * Snowflake ID layout (63 bits, fits a signed Postgres BIGINT):
 *
 *   | 41 bits: ms since epoch | 10 bits: worker id | 12 bits: sequence |
 *
 * IDs are serialized as decimal strings because JSON numbers lose precision above 2^53.
 */

export const CHINCHI_EPOCH = Date.UTC(2026, 0, 1)

const WORKER_ID_BITS = 10n
const SEQUENCE_BITS = 12n
const TIMESTAMP_SHIFT = WORKER_ID_BITS + SEQUENCE_BITS

export const MAX_WORKER_ID = Number((1n << WORKER_ID_BITS) - 1n)
export const MAX_SEQUENCE = Number((1n << SEQUENCE_BITS) - 1n)

const MAX_SNOWFLAKE = (1n << 63n) - 1n
const SNOWFLAKE_PATTERN = /^(0|[1-9]\d{0,18})$/

export type Snowflake = string

export interface SnowflakeGeneratorOptions {
  readonly workerId: number
  readonly epoch?: number
  readonly now?: () => number
}

export interface DecodedSnowflake {
  readonly timestamp: number
  readonly workerId: number
  readonly sequence: number
}

interface GeneratorState {
  readonly lastTimestamp: number
  readonly sequence: number
}

const assertWorkerId = (workerId: number): void => {
  if (!Number.isInteger(workerId) || workerId < 0 || workerId > MAX_WORKER_ID) {
    throw new RangeError(`Snowflake worker id must be an integer in [0, ${MAX_WORKER_ID}]`)
  }
}

const elapsedSinceEpoch = (timestamp: number, epoch: number): bigint => {
  if (timestamp < epoch) {
    throw new RangeError('Snowflake timestamp is before the epoch')
  }
  return BigInt(timestamp - epoch)
}

const encode = (elapsed: bigint, workerId: number, sequence: number): Snowflake =>
  ((elapsed << TIMESTAMP_SHIFT) | (BigInt(workerId) << SEQUENCE_BITS) | BigInt(sequence)).toString()

/**
 * Computes the next generator state. The clock never goes backwards from the generator's
 * point of view, and once the per-millisecond sequence is exhausted we borrow the next
 * millisecond instead of blocking, which keeps IDs unique and strictly increasing.
 */
const advance = (state: GeneratorState | null, now: number): GeneratorState => {
  if (state === null || now > state.lastTimestamp) {
    return { lastTimestamp: now, sequence: 0 }
  }
  if (state.sequence < MAX_SEQUENCE) {
    return { lastTimestamp: state.lastTimestamp, sequence: state.sequence + 1 }
  }
  return { lastTimestamp: state.lastTimestamp + 1, sequence: 0 }
}

export const createSnowflakeGenerator = ({
  workerId,
  epoch = CHINCHI_EPOCH,
  now = Date.now,
}: SnowflakeGeneratorOptions): (() => Snowflake) => {
  assertWorkerId(workerId)

  // The generator is inherently stateful; state is replaced, never mutated in place.
  let state: GeneratorState | null = null

  return () => {
    const nextState = advance(state, now())
    const elapsed = elapsedSinceEpoch(nextState.lastTimestamp, epoch)
    state = nextState
    return encode(elapsed, workerId, nextState.sequence)
  }
}

export const decodeSnowflake = (id: Snowflake, epoch = CHINCHI_EPOCH): DecodedSnowflake => {
  if (!SNOWFLAKE_PATTERN.test(id)) {
    throw new TypeError(`Invalid snowflake: ${JSON.stringify(id)}`)
  }
  const value = BigInt(id)
  return {
    timestamp: Number(value >> TIMESTAMP_SHIFT) + epoch,
    workerId: Number((value >> SEQUENCE_BITS) & BigInt(MAX_WORKER_ID)),
    sequence: Number(value & BigInt(MAX_SEQUENCE)),
  }
}

/** Smallest possible ID for a moment in time; useful as a pagination cursor by date. */
export const snowflakeFromTimestamp = (timestamp: number, epoch = CHINCHI_EPOCH): Snowflake =>
  encode(elapsedSinceEpoch(timestamp, epoch), 0, 0)

export const compareSnowflakes = (a: Snowflake, b: Snowflake): -1 | 0 | 1 => {
  const left = BigInt(a)
  const right = BigInt(b)
  if (left === right) return 0
  return left < right ? -1 : 1
}

// A single refinement: zod runs every check even after one fails, and BigInt() throws on
// non-numeric input, so the pattern must gate the range check.
export const snowflakeSchema = z
  .string()
  .refine(
    (value) => SNOWFLAKE_PATTERN.test(value) && BigInt(value) <= MAX_SNOWFLAKE,
    'Invalid snowflake',
  )
