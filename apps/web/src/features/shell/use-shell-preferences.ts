import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_SHELL_PREFERENCES } from './shell'
import { useShell } from './shell-context'

import type { ShellPreferences } from './shell'

/** The shell's preferences, loaded once; `save` writes them through and keeps the copy. */
export const useShellPreferences = () => {
  const shell = useShell()
  const [preferences, setPreferences] = useState<ShellPreferences | null>(null)

  useEffect(() => {
    if (!shell) return
    let alive = true
    void shell.preferences
      .load()
      .then((loaded) => {
        if (alive) setPreferences(loaded)
      })
      .catch(() => {
        if (alive) setPreferences(DEFAULT_SHELL_PREFERENCES)
      })
    return () => {
      alive = false
    }
  }, [shell])

  const save = useCallback(
    async (change: Partial<ShellPreferences>) => {
      if (!shell) return
      const next = { ...(preferences ?? DEFAULT_SHELL_PREFERENCES), ...change }
      setPreferences(next)
      await shell.preferences.save(next)
    },
    [shell, preferences],
  )

  return { shell, preferences, save }
}
