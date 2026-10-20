import { waveformOf } from './waveform'

/** One context decodes every voice message (decoding needs no sound output). */
let context: AudioContext | null = null

/**
 * Length and waveform of a recording. MediaRecorder's WebM has no length in its header, so the
 * audio element alone would say "Infinity": decoding tells the truth. Null without Web Audio.
 */
export const decodeVoice = async (
  blob: Blob,
): Promise<{ duration: number; waveform: number[] } | null> => {
  if (typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    return { duration: buffer.duration, waveform: waveformOf(buffer.getChannelData(0)) }
  } catch {
    return null
  }
}
