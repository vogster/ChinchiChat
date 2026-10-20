import { describe, expect, it } from 'vitest'

import { createEphemeral } from '../e2ee/approval-crypto'
import { openFromApprover, sealForNewDevice } from './qr-login-crypto'

const RECOVERY = 'ABCD-EFGH-IJKL-MNOP'

describe('handing the recovery key over a QR sign-in', () => {
  it('opens on the device whose key was in the QR', async () => {
    const newDevice = await createEphemeral()
    const { sealed, approverKey } = await sealForNewDevice('ticket', newDevice.publicKey, RECOVERY)

    expect(await openFromApprover('ticket', newDevice, approverKey, sealed)).toBe(RECOVERY)
  })

  it('does not open for another sign-in or another key', async () => {
    const newDevice = await createEphemeral()
    const stranger = await createEphemeral()
    const { sealed, approverKey } = await sealForNewDevice('ticket', newDevice.publicKey, RECOVERY)

    expect(await openFromApprover('other', newDevice, approverKey, sealed)).toBeNull()
    expect(await openFromApprover('ticket', stranger, approverKey, sealed)).toBeNull()
    expect(await openFromApprover('ticket', newDevice, 'not a key', sealed)).toBeNull()
  })
})
