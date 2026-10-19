import { useDeviceFlag } from '../../lib/device-flag'

/** Seen once per browser: what it explains is the same in every encrypted conversation. */
export const ENCRYPTION_GUIDE_SEEN = 'chinchi.e2ee.guideSeen'

export const useEncryptionGuideSeen = () => useDeviceFlag(ENCRYPTION_GUIDE_SEEN)
