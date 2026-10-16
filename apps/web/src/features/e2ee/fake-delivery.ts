import { verifyStatement } from '@chinchi/e2ee'
import { ApiError } from '@chinchi/sdk'
import { deviceStatement } from '@chinchi/shared'

import { fromBase64 } from './codec'

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
  /** Public user keys (base64) by user id. */
  const userKeys = new Map<string, string>()
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
          userSignature: null,
        }
        devices.push(device)
        return { device }
      },
      userKey: async (id) => {
        const owner = id === '@me' ? userId : id
        const publicKey = userKeys.get(owner)
        return {
          userKey: publicKey
            ? { userId: owner, publicKey, createdAt: new Date().toISOString() }
            : null,
        }
      },
      setUserKey: async ({ publicKey, replace }) => {
        if (userKeys.has(userId) && !replace) {
          throw new ApiError(409, 'USER_KEY_EXISTS', 'This user already has a key')
        }
        userKeys.set(userId, publicKey)
        if (replace) {
          for (const [i, d] of devices.entries()) {
            if (d.userId === userId) devices[i] = { ...d, userSignature: null }
          }
        }
        return { userKey: { userId, publicKey, createdAt: new Date().toISOString() } }
      },
      signDevice: async (deviceId, signature) => {
        const index = devices.findIndex((d) => d.id === deviceId && d.userId === userId)
        const device = devices[index]
        const publicKey = userKeys.get(userId)
        if (!device) throw new ApiError(404, 'UNKNOWN_DEVICE', 'Unknown device')
        if (!publicKey) throw new ApiError(409, 'NO_USER_KEY', 'Set a user key first')
        const statement = deviceStatement(userId, deviceId, device.signaturePublicKey)
        if (!(await verifyStatement(fromBase64(publicKey), statement, fromBase64(signature)))) {
          throw new ApiError(400, 'INVALID_SIGNATURE', 'Bad signature')
        }
        devices[index] = { ...device, userSignature: signature }
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
      update: async (_channelId, messageId, change) => {
        const index = messages.findIndex((m) => m.id === messageId && m.authorId === userId)
        const found = messages[index]
        if (!found) throw new ApiError(404, 'UNKNOWN_MESSAGE', 'Unknown message')
        const editedAt = new Date(Date.now() + index).toISOString()
        messages[index] = { ...found, ciphertext: change.ciphertext }
        return { message: { id: messageId, ciphertext: change.ciphertext, editedAt } }
      },
    },
  })

  return { apiFor, messages, devices, handshakes, userKeys }
}
