import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRingtone } from './ringtone'

const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  currentTime = 0
  destination = {}
  oscillators = 0
  close = vi.fn(async () => undefined)
  constructor() {
    FakeAudioContext.instances.push(this)
  }
  createOscillator() {
    this.oscillators += 1
    const node = { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    node.connect.mockImplementation((next: unknown) => next)
    return node
  }
  createGain() {
    return { gain: param(), connect: vi.fn((next: unknown) => next) }
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeAudioContext.instances = []
})

describe('ringtone', () => {
  it('chimes two tones every few seconds until stopped', () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const ringtone = createRingtone()

    ringtone.start()
    ringtone.start()
    const [context] = FakeAudioContext.instances
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(context?.oscillators).toBe(2)

    vi.advanceTimersByTime(3000)
    expect(context?.oscillators).toBe(4)

    ringtone.stop()
    vi.advanceTimersByTime(9000)
    expect(context?.oscillators).toBe(4)
    expect(context?.close).toHaveBeenCalled()
  })

  it('stays silent where the browser has no Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => createRingtone().start()).not.toThrow()
  })
})
