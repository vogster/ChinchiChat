import { useCallback, useSyncExternalStore } from 'react'

/**
 * Yes/no choices remembered by this browser (a hidden notice, a guide seen once), shared live
 * between components and tabs. If storage is blocked, a choice holds until the page reloads.
 */
const memory = new Map<string, boolean>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  // Another tab of this browser changed it.
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

export const setDeviceFlag = (key: string, value: boolean) => {
  memory.set(key, value)
  try {
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    // Kept in memory only.
  }
  for (const listener of listeners) listener()
}

export const useDeviceFlag = (key: string) => {
  const value = useSyncExternalStore(subscribe, () => read(key))
  const set = useCallback((next: boolean) => setDeviceFlag(key, next), [key])
  return [value, set] as const
}
