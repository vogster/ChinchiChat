import { useState } from 'react'

const KEY = 'chinchi:nsfw-ok'

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Whether this browser agreed to see age-restricted channels; asked once. */
export const useNsfwConsent = (): readonly [boolean, () => void] => {
  const [ok, setOk] = useState(read)
  const accept = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Storage may be off (private mode); the answer then lasts until reload.
    }
    setOk(true)
  }
  return [ok, accept] as const
}
