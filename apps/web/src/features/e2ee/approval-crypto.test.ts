import { describe, expect, it } from 'vitest'

import {
  agree,
  commitmentOf,
  createEphemeral,
  openSecrets,
  sealSecrets,
  SAS_EMOJI,
} from './approval-crypto'

const transcript = {
  approvalId: '950',
  newDeviceId: '701',
  approverDeviceId: '700',
}

describe('approval crypto', () => {
  it('shows the same four emoji on both devices, and secrets cross between them', async () => {
    const fresh = await createEphemeral()
    const old = await createEphemeral()
    const keys = { newKey: fresh.publicKey, approverKey: old.publicKey }

    const onNew = await agree(fresh.privateKey, old.publicKey, { ...transcript, ...keys })
    const onOld = await agree(old.privateKey, fresh.publicKey, { ...transcript, ...keys })

    expect(onNew.emoji).toHaveLength(4)
    expect(onNew.emoji).toEqual(onOld.emoji)
    for (const emoji of onNew.emoji) expect(SAS_EMOJI).toContain(emoji)
    const sealed = await sealSecrets(onOld.secretKey, { recoveryKey: 'ABCD-EFGH' })
    expect(await openSecrets(onNew.secretKey, sealed)).toEqual({ recoveryKey: 'ABCD-EFGH' })
  })

  it('shows different emoji when someone in the middle swaps a key', async () => {
    const fresh = await createEphemeral()
    const old = await createEphemeral()
    const relay = await createEphemeral()

    // The relay gives the new device its own key instead of the approver's.
    const onNew = await agree(fresh.privateKey, relay.publicKey, {
      ...transcript,
      newKey: fresh.publicKey,
      approverKey: relay.publicKey,
    })
    const onOld = await agree(old.privateKey, fresh.publicKey, {
      ...transcript,
      newKey: fresh.publicKey,
      approverKey: old.publicKey,
    })

    expect(onNew.emoji).not.toEqual(onOld.emoji)
    const sealed = await sealSecrets(onOld.secretKey, { recoveryKey: 'ABCD' })
    expect(await openSecrets(onNew.secretKey, sealed)).toBeNull()
  })

  it('commits to a key without showing it', async () => {
    const { publicKey } = await createEphemeral()

    const commitment = await commitmentOf(publicKey)

    expect(commitment).toHaveLength(44)
    expect(commitment).not.toBe(publicKey)
    expect(await commitmentOf(publicKey)).toBe(commitment)
    expect(SAS_EMOJI).toHaveLength(64)
  })
})
