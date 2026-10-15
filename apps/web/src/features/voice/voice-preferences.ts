import { useSyncExternalStore } from 'react'

/** Devices and processing for calls; kept per browser, since devices belong to the machine. */
export interface VoicePreferences {
  readonly audioInput: string | null
  readonly audioOutput: string | null
  readonly videoInput: string | null
  readonly noiseSuppression: boolean
}

const STORAGE_KEY = 'chinchi:voice-preferences'

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  audioInput: null,
  audioOutput: null,
  videoInput: null,
  noiseSuppression: true,
}

const read = (): VoicePreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const saved = raw ? (JSON.parse(raw) as Partial<VoicePreferences>) : {}
    return { ...DEFAULT_VOICE_PREFERENCES, ...saved }
  } catch {
    // Private mode or blocked storage: defaults still work.
    return DEFAULT_VOICE_PREFERENCES
  }
}

let current: VoicePreferences | null = null
const listeners = new Set<() => void>()

export const getVoicePreferences = (): VoicePreferences => {
  current ??= read()
  return current
}

export const setVoicePreferences = (change: Partial<VoicePreferences>): void => {
  current = { ...getVoicePreferences(), ...change }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Not persisted, but applies for this session.
  }
  for (const listener of listeners) listener()
}

export const subscribeVoicePreferences = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useVoicePreferences = (): VoicePreferences =>
  useSyncExternalStore(subscribeVoicePreferences, getVoicePreferences, getVoicePreferences)

/** Tests start from defaults. */
export const resetVoicePreferences = (): void => {
  current = null
}
