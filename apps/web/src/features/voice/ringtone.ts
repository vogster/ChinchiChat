/**
 * The incoming-call ring, synthesized with Web Audio (no sound file to license): two short
 * soft tones every few seconds until stopped.
 */
const PATTERN_MS = 3000
const TONES = [
  { frequency: 660, at: 0 },
  { frequency: 880, at: 0.18 },
] as const
const TONE_S = 0.16
const VOLUME = 0.12

export interface Ringtone {
  start(): void
  stop(): void
}

export const createRingtone = (): Ringtone => {
  let context: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  const ring = () => {
    if (!context) return
    const now = context.currentTime
    for (const tone of TONES) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = tone.frequency
      // A soft attack and release, so it chimes instead of clicking.
      gain.gain.setValueAtTime(0, now + tone.at)
      gain.gain.linearRampToValueAtTime(VOLUME, now + tone.at + 0.02)
      gain.gain.linearRampToValueAtTime(0, now + tone.at + TONE_S)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(now + tone.at)
      oscillator.stop(now + tone.at + TONE_S)
    }
  }

  return {
    start() {
      if (timer || typeof AudioContext === 'undefined') return
      context = new AudioContext()
      ring()
      timer = setInterval(ring, PATTERN_MS)
    },
    stop() {
      clearInterval(timer)
      timer = undefined
      void context?.close()
      context = null
    },
  }
}
