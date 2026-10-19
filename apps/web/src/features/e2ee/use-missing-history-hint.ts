import { useCallback } from 'react'

import { useDeviceFlag } from '../../lib/device-flag'
import { useCurrentUser } from '../auth/use-auth-actions'

/**
 * Whether the user hid the "old messages are unavailable here" notice. Kept per device (this
 * browser) and account: what it explains is the same in every encrypted conversation here.
 */
const keyFor = (userId: string) => `chinchi.recovery.missingHidden:${userId}`

export const useMissingHistoryHint = () => {
  const [hidden, setHidden] = useDeviceFlag(keyFor(useCurrentUser()?.id ?? ''))
  const hide = useCallback(() => setHidden(true), [setHidden])
  const show = useCallback(() => setHidden(false), [setHidden])
  return { hidden, hide, show }
}
