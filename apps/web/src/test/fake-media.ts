import { vi } from 'vitest'

/** An EBML (WebM) header: what a recording starts with, as far as the app checks. */
export const WEBM_BYTES = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01])

/** MediaRecorder that "records" one WebM chunk; it supports only WebM, like Chrome. */
export class FakeMediaRecorder extends EventTarget {
  static readonly instances: FakeMediaRecorder[] = []
  static isTypeSupported = (type: string) => type.startsWith('audio/webm')
  state: 'inactive' | 'recording' = 'inactive'

  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions,
  ) {
    super()
    FakeMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    const data = new Blob([WEBM_BYTES], { type: 'audio/webm' })
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data }))
    this.dispatchEvent(new Event('stop'))
  }
}

/**
 * A microphone and a recorder for tests; `deny` makes the browser refuse the microphone.
 * Returns the track's `stop`, to check the microphone is let go. Undo with `vi.unstubAllGlobals()`.
 */
export const fakeMicrophone = ({ deny = false } = {}) => {
  const stopTrack = vi.fn()
  FakeMediaRecorder.instances.length = 0
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        if (deny) throw new DOMException('Permission denied', 'NotAllowedError')
        return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
      }),
    },
  })
  return { stopTrack }
}

/** Web Audio that decodes anything as a 42-second recording with a rising waveform. */
export const fakeAudioDecoding = () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = async () => ({
        duration: 42,
        getChannelData: () => Float32Array.from({ length: 400 }, (_, i) => i / 400),
      })
      close = async () => undefined
    },
  )
}

/** `play`/`pause` on media elements, which jsdom lacks, firing the events a browser fires. */
export const fakeMediaPlayback = () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false })
    this.dispatchEvent(new Event('play'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true })
    this.dispatchEvent(new Event('pause'))
  })
}
