/**
 * What `MediaRecorder` is asked to write, best first: Chrome and Firefox write Opus in WebM,
 * Safari AAC in MP4. The file goes up under the bare container type the server checks.
 */
const FORMATS = [
  { mimeType: 'audio/webm;codecs=opus', type: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/ogg;codecs=opus', type: 'audio/ogg', extension: 'ogg' },
  { mimeType: 'audio/mp4', type: 'audio/mp4', extension: 'm4a' },
] as const

export type RecordingFormat = (typeof FORMATS)[number]

/** The first format this browser records, or null where it can't record at all. */
export const pickRecordingFormat = (): RecordingFormat | null => {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
  return FORMATS.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ?? null
}

const two = (value: number) => String(value).padStart(2, '0')

/** "voice-2026-10-21-14-05.webm", in local time. */
export const voiceFileName = (at: Date, format: RecordingFormat): string =>
  `voice-${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}-${two(at.getHours())}-${two(at.getMinutes())}.${format.extension}`
