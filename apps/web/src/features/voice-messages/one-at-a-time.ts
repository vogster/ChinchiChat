/** The voice message playing now: starting another pauses it, as in any messenger. */
let playing: HTMLAudioElement | null = null

export const playOnly = (audio: HTMLAudioElement): Promise<void> => {
  if (playing && playing !== audio) playing.pause()
  playing = audio
  return audio.play()
}
