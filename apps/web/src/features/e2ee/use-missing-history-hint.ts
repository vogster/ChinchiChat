import { useCallback, useSyncExternalStore } from 'react'

import { useCurrentUser } from '../auth/use-auth-actions'

/**
 * Whether the user hid the "old messages are unavailable here" notice. Kept per device (this
 * browser) and account: what it explains is the same in every encrypted conversation here.
 */
const keyFor = (userId: string) => `chinchi.recovery.missingHidden:${userId}`

/** Storage blocked: the choice still holds until the page reloads. */
const memory = new Map<string, boolean>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  // Another tab of this browser hid or showed it.
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return memory.get(key) ?? false
  }
}

const write = (key: string, hidden: boolean) => {
  memory.set(key, hidden)
  try {
    if (hidden) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // Kept in memory only.
  }
  for (const listener of listeners) listener()
}

export const useMissingHistoryHint = () => {
  const key = keyFor(useCurrentUser()?.id ?? '')
  const hidden = useSyncExternalStore(subscribe, () => read(key))
  const hide = useCallback(() => write(key, true), [key])
  const show = useCallback(() => write(key, false), [key])
  return { hidden, hide, show }
}
