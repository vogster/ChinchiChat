import { useEffect, useState } from 'react'

/** The current time, moving on every `everyMs` (for "3 h left" and the like). */
export const useNow = (everyMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
