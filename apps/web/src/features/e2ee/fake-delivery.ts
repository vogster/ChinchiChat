import { ApiError } from '@chinchi/sdk'

import type { E2eeApi } from './client'
import type { ClaimedKeyPackage, Device, Handshake } from '@chinchi/shared'

/**
 * The server's part of encrypted conversations, in memory, for tests: devices, key packages,
 * epoch-ordered commits, Welcomes for their device only, and ciphertext messages.
 */
export const createFakeDelivery = () => {
  let next = 1000
  const id = () => String((next += 1))
  const devices: Device[] = []
  const keyPackages: { id: string; deviceId: string; package: string; lastResort: boolean }[] = []
  const epochs = new Map<string, number>()
  const handshakes: Handshake[] = []
  const messages: {
    id: string
    channelId: string
    authorId: string
    ciphertext: string
    attachmentIds: readonly string[]
  }[] = []

  const apiFor = (userId: string): E2eeApi => ({
    e2ee: {
      myDevices: async () => ({ devices: devices.filter((d) => d.userId === userId) }),
      devicesOf: async (otherId) => ({ devices: devices.filter((d) => d.userId === otherId) }),
      registerDevice: async (body) => {
        // As the server: the owner registering the same key again gets the same device.
        const existing = devices.find((d) => d.signaturePublicKey === body.signaturePublicKey)
        if (existing?.userId === userId && !existing.revokedAt) return { device: existing }
        if (existing) throw new ApiError(409, 'DEVICE_EXISTS', 'This device is already registered')
        const device: Device = {
          id: id(),
          userId,
          ...body,
          createdAt: new Date().toISOString(),
          revokedAt: null,
        }
        devices.push(device)
        return { device }
      },
      deleteDevice: async (deviceId) => {
        const index = devices.findIndex((d) => d.id === deviceId && d.userId === userId)
        const found = devices[index]
        if (found) devices[index] = { ...found, revokedAt: new Date().toISOString() }
        for (let i = keyPackages.length - 1; i >= 0; i -= 1) {
          if (keyPackages[i]?.deviceId === deviceId) keyPackages.splice(i, 1)
        }
      },
      uploadKeyPackages: async (deviceId, body) => {
        for (const pkg of body.packages) {
          keyPackages.push({ id: id(), deviceId, package: pkg, lastResort: false })
        }
        if (body.lastResort) {
          keyPackages.push({ id: id(), deviceId, package: body.lastResort, lastResort: true })
        }
      },
      countKeyPackages: async (deviceId) => ({
        count: keyPackages.filter((k) => k.deviceId === deviceId && !k.lastResort).length,
      }),
      claimKeyPackages: async (otherId) => {
        const claimed: ClaimedKeyPackage[] = []
        for (const device of devices.filter((d) => d.userId === otherId && !d.revokedAt)) {
          const index = keyPackages.findIndex((k) => k.deviceId === device.id && !k.lastResort)
          const found =
            index >= 0
              ? keyPackages.splice(index, 1)[0]
              : keyPackages.find((k) => k.deviceId === device.id && k.lastResort)
          if (found)
            claimed.push({ deviceId: device.id, keyPackageId: found.id, package: found.package })
        }
        return { keyPackages: claimed }
      },
      postCommit: async (channelId, body) => {
        const current = epochs.get(channelId) ?? 0
        if (body.epoch !== current)
          throw new ApiError(409, 'STALE_EPOCH', 'Another commit came first')
        epochs.set(channelId, current + 1)
        const base = { channelId, epoch: body.epoch, senderDeviceId: body.deviceId }
        handshakes.push({
          ...base,
          id: id(),
          kind: 'commit',
          targetDeviceId: null,
          keyPackageId: null,
          payload: body.commit,
        })
        for (const target of body.welcomeTargets ?? []) {
          handshakes.push({
            ...base,
            id: id(),
            kind: 'welcome',
            targetDeviceId: target.deviceId,
            keyPackageId: target.keyPackageId,
            payload: body.welcome as string,
          })
        }
      },
      handshakes: async (channelId, query) => ({
        handshakes: handshakes.filter(
          (h) =>
            h.channelId === channelId &&
            (query.after === undefined || BigInt(h.id) > BigInt(query.after)) &&
            (h.targetDeviceId === null || h.targetDeviceId === query.deviceId),
        ),
      }),
    },
    messages: {
      create: async (channelId, body) => {
        const message = {
          id: id(),
          channelId,
          authorId: userId,
          ciphertext: body.ciphertext ?? '',
          attachmentIds: body.attachmentIds ?? [],
        }
        messages.push(message)
        return { message: { id: message.id, ciphertext: message.ciphertext } }
      },
    },
  })

  return { apiFor, messages, devices, handshakes }
}
