import { describe, expect, it } from 'vitest'

import { formatDuration, waveformOf } from './waveform'

describe('waveformOf', () => {
  it('gives one level per bar, the loudest at full height', () => {
    const samples = Float32Array.from([0.1, -0.1, 0.5, -0.5, 0.2, -0.2, 0, 0])
    const levels = waveformOf(samples, 4)
    expect(levels).toHaveLength(4)
    expect(levels[1]).toBe(1)
    expect(levels[0]).toBeCloseTo(0.2)
    // Silence still shows as a thin bar.
    expect(levels[3]).toBe(0.08)
  })

  it('keeps a silent or empty recording flat', () => {
    expect(waveformOf(new Float32Array(10), 5)).toEqual([0.08, 0.08, 0.08, 0.08, 0.08])
    expect(waveformOf(new Float32Array(0), 3)).toEqual([0.08, 0.08, 0.08])
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [7.9, '0:07'],
    [42, '0:42'],
    [725, '12:05'],
    [Number.POSITIVE_INFINITY, '0:00'],
    [Number.NaN, '0:00'],
  ])('%s seconds read as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text)
  })
})
