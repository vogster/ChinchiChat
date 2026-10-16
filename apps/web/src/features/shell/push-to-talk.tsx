import { useEffect } from 'react'

import { useVoice } from '../voice/voice-context'
import { useShellPreferences } from './use-shell-preferences'

/**
 * Push-to-talk through the shell's global shortcut: while connected to voice with a shortcut
 * set, the microphone stays muted and opens only while the key is held, even when the window
 * is not in front. Renders nothing; lives inside the voice provider.
 */
export const PushToTalk = () => {
  const { shell, preferences } = useShellPreferences()
  const { status, setMute } = useVoice()
  const shortcut = preferences?.pushToTalk ?? null
  const active = Boolean(shell) && status === 'connected' && shortcut !== null

  useEffect(() => {
    if (!shell || !active || !shortcut) return
    let unbind: (() => Promise<void>) | null = null
    let alive = true
    setMute(true)
    shell
      .bindPushToTalk(shortcut, (pressed) => {
        if (alive) setMute(!pressed)
      })
      .then((release) => {
        if (alive) unbind = release
        else void release()
      })
      // A shortcut another app holds: talking stays on the on-screen button.
      .catch(() => undefined)
    return () => {
      alive = false
      void unbind?.()
      setMute(true)
    }
  }, [shell, active, shortcut, setMute])

  return null
}
