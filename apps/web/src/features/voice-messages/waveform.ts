/** Bars a voice message's waveform is drawn with. */
export const WAVEFORM_BARS = 40

/**
 * Loudness per bar (0…1) from decoded samples: the RMS of each slice, scaled so the loudest
 * bar is full height; a silent recording stays flat but visible.
 */
export const waveformOf = (samples: Float32Array, bars: number = WAVEFORM_BARS): number[] => {
  const slice = Math.max(1, Math.floor(samples.length / bars))
  const levels = Array.from({ length: bars }, (_, bar) => {
    const start = bar * slice
    const end = Math.min(samples.length, start + slice)
    let sum = 0
    for (let i = start; i < end; i += 1) sum += (samples[i] ?? 0) ** 2
    return end > start ? Math.sqrt(sum / (end - start)) : 0
  })
  const loudest = Math.max(...levels)
  return levels.map((level) => (loudest > 0 ? Math.max(0.08, level / loudest) : 0.08))
}

/** "0:42", "12:05": minutes and seconds, as voice messages show them. */
export const formatDuration = (seconds: number): string => {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
