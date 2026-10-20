import { useCallback, useEffect, useRef, useState } from 'react'

import { pickRecordingFormat, voiceFileName } from './recording-format'

import type { RecordingFormat } from './recording-format'

/** Longest voice message; recording stops and sends by itself at this point. */
export const VOICE_MAX_SECONDS = 10 * 60
/** Opus speech is clear at this rate: ten minutes stay under 2.5 MB. */
const BITS_PER_SECOND = 32_000
const TICK_MS = 200

export type RecorderError = 'denied' | 'failed'

interface Session {
  readonly recorder: MediaRecorder
  readonly stream: MediaStream
  readonly format: RecordingFormat
  readonly startedAt: number
  readonly chunks: Blob[]
  readonly audio: AudioContext | null
  readonly analyser: AnalyserNode | null
  send: boolean
}

/** Loudness now (0…1) from the microphone, for the level meter. */
const levelOf = (analyser: AnalyserNode) => {
  const samples = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(samples)
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0)
  return Math.min(1, peak / 64)
}

const meter = (stream: MediaStream) => {
  if (typeof AudioContext === 'undefined') return { audio: null, analyser: null }
  const audio = new AudioContext()
  const analyser = audio.createAnalyser()
  analyser.fftSize = 256
  audio.createMediaStreamSource(stream).connect(analyser)
  return { audio, analyser }
}

/**
 * Recording a voice message: `start` asks for the microphone, `stop(true)` hands the file to
 * `onRecorded`, `stop(false)` throws it away. Nothing is kept after a stop.
 */
export const useVoiceRecorder = (onRecorded: (file: File) => void) => {
  const session = useRef<Session | null>(null)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<RecorderError | null>(null)
  const recorded = useRef(onRecorded)
  useEffect(() => {
    recorded.current = onRecorded
  })

  const stop = useCallback((send: boolean) => {
    const current = session.current
    if (!current) return
    current.send = send
    if (current.recorder.state !== 'inactive') current.recorder.stop()
  }, [])

  const start = useCallback(async () => {
    const format = pickRecordingFormat()
    if (!format || session.current) return
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (failure) {
      setError(
        failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'denied' : 'failed',
      )
      return
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      audioBitsPerSecond: BITS_PER_SECOND,
    })
    const current: Session = {
      recorder,
      stream,
      format,
      startedAt: Date.now(),
      chunks: [],
      ...meter(stream),
      send: false,
    }
    session.current = current
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) current.chunks.push(event.data)
    })
    recorder.addEventListener('stop', () => {
      for (const track of current.stream.getTracks()) track.stop()
      void current.audio?.close().catch(() => undefined)
      session.current = null
      setRecording(false)
      setSeconds(0)
      setLevel(0)
      if (!current.send || current.chunks.length === 0) return
      const blob = new Blob(current.chunks, { type: format.type })
      recorded.current(
        new File([blob], voiceFileName(new Date(current.startedAt), format), { type: format.type }),
      )
    })
    recorder.start(1000)
    setSeconds(0)
    setRecording(true)
  }, [])

  // The clock and the level meter, and the stop at the longest allowed length.
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      const current = session.current
      if (!current) return
      const elapsed = (Date.now() - current.startedAt) / 1000
      setSeconds(elapsed)
      if (current.analyser) setLevel(levelOf(current.analyser))
      if (elapsed >= VOICE_MAX_SECONDS) stop(true)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [recording, stop])

  // Leaving the conversation mid-recording throws the recording away.
  useEffect(() => () => stop(false), [stop])

  return { recording, seconds, level, error, start, stop }
}
