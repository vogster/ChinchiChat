import { describe, expect, it } from 'vitest'

import {
  MAX_SEQUENCE,
  MAX_WORKER_ID,
  CHINCHI_EPOCH,
  compareSnowflakes,
  createSnowflakeGenerator,
  decodeSnowflake,
  snowflakeFromTimestamp,
  snowflakeSchema,
} from './snowflake'

const fixedClock = (ms: number) => () => ms

const sequenceClock = (values: readonly number[]) => {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] as number
}

describe('createSnowflakeGenerator', () => {
  it('returns a decimal string id', () => {
    const next = createSnowflakeGenerator({ workerId: 1 })
    expect(next()).toMatch(/^[1-9]\d*$/)
  })

  it('encodes timestamp, worker id and sequence', () => {
    const now = CHINCHI_EPOCH + 123_456
    const next = createSnowflakeGenerator({ workerId: 42, now: fixedClock(now) })

    expect(decodeSnowflake(next())).toEqual({ timestamp: now, workerId: 42, sequence: 0 })
    expect(decodeSnowflake(next())).toEqual({ timestamp: now, workerId: 42, sequence: 1 })
  })

  it('resets the sequence when the clock advances', () => {
    const base = CHINCHI_EPOCH + 1_000
    const next = createSnowflakeGenerator({
      workerId: 0,
      now: sequenceClock([base, base, base + 1]),
    })

    next()
    next()
    expect(decodeSnowflake(next())).toMatchObject({ timestamp: base + 1, sequence: 0 })
  })

  it('produces unique, strictly increasing ids beyond the per-millisecond sequence limit', () => {
    const next = createSnowflakeGenerator({ workerId: 7, now: fixedClock(CHINCHI_EPOCH + 5_000) })
    const ids = Array.from({ length: (MAX_SEQUENCE + 1) * 3 }, () => next())

    expect(new Set(ids).size).toBe(ids.length)
    ids.slice(1).forEach((id, i) => {
      expect(compareSnowflakes(ids[i] as string, id)).toBe(-1)
    })
  })

  it('stays monotonic when the system clock moves backwards', () => {
    const base = CHINCHI_EPOCH + 10_000
    const next = createSnowflakeGenerator({
      workerId: 3,
      now: sequenceClock([base, base - 500, base - 1_000]),
    })

    const ids = [next(), next(), next()]
    expect(compareSnowflakes(ids[0] as string, ids[1] as string)).toBe(-1)
    expect(compareSnowflakes(ids[1] as string, ids[2] as string)).toBe(-1)
  })

  it('supports a custom epoch', () => {
    const epoch = Date.UTC(2020, 0, 1)
    const next = createSnowflakeGenerator({ workerId: 0, epoch, now: fixedClock(epoch + 99) })

    expect(decodeSnowflake(next(), epoch).timestamp).toBe(epoch + 99)
  })

  it.each([-1, MAX_WORKER_ID + 1, 1.5, Number.NaN])('rejects invalid worker id %s', (workerId) => {
    expect(() => createSnowflakeGenerator({ workerId })).toThrow(/worker id/i)
  })

  it('throws when the clock is before the epoch', () => {
    const next = createSnowflakeGenerator({ workerId: 0, now: fixedClock(CHINCHI_EPOCH - 1) })
    expect(() => next()).toThrow(/epoch/i)
  })
})

describe('decodeSnowflake', () => {
  it('throws on malformed input', () => {
    expect(() => decodeSnowflake('not-an-id')).toThrow(/invalid snowflake/i)
  })
})

describe('snowflakeFromTimestamp', () => {
  it('builds the smallest id for a given moment', () => {
    const ms = CHINCHI_EPOCH + 86_400_000
    expect(decodeSnowflake(snowflakeFromTimestamp(ms))).toEqual({
      timestamp: ms,
      workerId: 0,
      sequence: 0,
    })
  })

  it('sorts before ids generated at the same moment', () => {
    const ms = CHINCHI_EPOCH + 42
    const next = createSnowflakeGenerator({ workerId: 5, now: fixedClock(ms) })
    expect(compareSnowflakes(snowflakeFromTimestamp(ms), next())).toBe(-1)
  })

  it('throws for timestamps before the epoch', () => {
    expect(() => snowflakeFromTimestamp(CHINCHI_EPOCH - 1)).toThrow(/epoch/i)
  })
})

describe('compareSnowflakes', () => {
  it('compares numerically, not lexicographically', () => {
    expect(compareSnowflakes('9', '10')).toBe(-1)
    expect(compareSnowflakes('10', '9')).toBe(1)
    expect(compareSnowflakes('77', '77')).toBe(0)
  })
})

describe('snowflakeSchema', () => {
  it.each(['0', '1', '123456789012345678', '9223372036854775807'])('accepts %s', (value) => {
    expect(snowflakeSchema.safeParse(value).success).toBe(true)
  })

  it.each(['', 'abc', '-1', '01', '1.5', ' 1', '9223372036854775808', '99999999999999999999'])(
    'rejects %j',
    (value) => {
      expect(snowflakeSchema.safeParse(value).success).toBe(false)
    },
  )

  it('rejects non-strings', () => {
    expect(snowflakeSchema.safeParse(123).success).toBe(false)
  })
})
