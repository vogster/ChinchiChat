import { useEffect, useState } from 'react'

/** The current time, refreshed once a minute: enough for things that end on their own. */
export const useMinuteClock = () => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
