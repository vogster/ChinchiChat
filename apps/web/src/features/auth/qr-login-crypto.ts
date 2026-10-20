import { agree, createEphemeral, openSecrets, sealSecrets } from '../e2ee/approval-crypto'

import type { Ephemeral } from '../e2ee/approval-crypto'

/**
 * Both sides bind the keys to this sign-in. There are no emoji to compare: the new device's key
 * reaches the approver through the camera (it is in the QR), not through the server.
 */
const transcript = (id: string, newKey: string, approverKey: string) => ({
  approvalId: `qr:${id}`,
  newDeviceId: '',
  approverDeviceId: '',
  newKey,
  approverKey,
})

/** On the approving device: the recovery key sealed for the key read from the QR. */
export const sealForNewDevice = async (id: string, newKey: string, recoveryKey: string) => {
  const own = await createEphemeral()
  const { secretKey } = await agree(own.privateKey, newKey, transcript(id, newKey, own.publicKey))
  return { sealed: await sealSecrets(secretKey, { recoveryKey }), approverKey: own.publicKey }
}

/** On the new device: the recovery key, or null when it doesn't open. */
export const openFromApprover = async (
  id: string,
  own: Ephemeral,
  approverKey: string,
  sealed: string,
): Promise<string | null> => {
  try {
    const { secretKey } = await agree(
      own.privateKey,
      approverKey,
      transcript(id, own.publicKey, approverKey),
    )
    return (await openSecrets(secretKey, sealed))?.recoveryKey ?? null
  } catch {
    return null
  }
}
