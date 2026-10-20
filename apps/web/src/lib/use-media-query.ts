import { useCallback, useSyncExternalStore } from 'react'

/** Whether a CSS media query matches now; without `matchMedia` (tests) it counts as matching. */
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? true)
}
