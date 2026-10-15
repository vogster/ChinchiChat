import { useEffect, useState } from 'react'

/** A search box value that settles a moment after typing stops, for list queries. */
export const useAdminSearch = (delayMs = 300) => {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), delayMs)
    return () => clearTimeout(timer)
  }, [text, delayMs])
  return { text, setText, query }
}
