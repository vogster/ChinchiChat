import { describe, expect, it } from 'vitest'

import { seqToStreamId, streamIdToSeq } from './redis-event-bus'

describe('stream id ↔ seq', () => {
  it.each([
    ['0-0', 0],
    ['1791982754235-0', 1_791_982_754_235_000],
    ['1791982754235-7', 1_791_982_754_235_007],
  ])('%s ↔ %d', (id, seq) => {
    expect(streamIdToSeq(id)).toBe(seq)
    expect(seqToStreamId(seq)).toBe(id)
  })

  it('stays an exact integer until well past the year 2200', () => {
    const year2200 = Date.UTC(2200, 0, 1)
    expect(Number.isSafeInteger(streamIdToSeq(`${year2200}-999`))).toBe(true)
  })
})
