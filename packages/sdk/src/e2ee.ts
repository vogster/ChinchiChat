import {
  backupEntrySchema,
  claimedKeyPackageSchema,
  deviceApprovalSchema,
  deviceSchema,
  handshakeSchema,
  keyBackupSchema,
  userKeySchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { id, queryString } from './url'

import type { Http } from './http'
import type {
  CreateKeyBackupRequest,
  ListBackupEntriesQuery,
  ListHandshakesQuery,
  PostCommitRequest,
  RegisterDeviceRequest,
  SetUserKeyRequest,
  Snowflake,
  UploadBackupEntriesRequest,
  UploadKeyPackagesRequest,
} from '@chinchi/shared'

const devicesResult = z.object({ devices: z.array(deviceSchema) })
const approvalResult = z.object({ approval: deviceApprovalSchema })

/** Encrypted conversations: devices, key packages and the MLS delivery service. */
export const createE2eeApi = (request: Http) => ({
  e2ee: {
    myDevices: () => request({ method: 'GET', path: '/users/@me/devices', data: devicesResult }),
    devicesOf: (userId: Snowflake) =>
      request({ method: 'GET', path: `/users/${id(userId)}/devices`, data: devicesResult }),
    registerDevice: (body: RegisterDeviceRequest) =>
      request({
        method: 'POST',
        path: '/users/@me/devices',
        body,
        data: z.object({ device: deviceSchema }),
      }),
    deleteDevice: (deviceId: Snowflake) =>
      request({ method: 'DELETE', path: `/users/@me/devices/${id(deviceId)}` }),
    /** A user's own key (cross-signing), or null before their first device sets one. */
    userKey: (userId: Snowflake | '@me') =>
      request({
        method: 'GET',
        path: `/users/${userId === '@me' ? '@me' : id(userId)}/e2ee/user-key`,
        data: z.object({ userKey: userKeySchema.nullable() }),
      }),
    setUserKey: (body: SetUserKeyRequest) =>
      request({
        method: 'PUT',
        path: '/users/@me/e2ee/user-key',
        body,
        data: z.object({ userKey: userKeySchema }),
      }),
    /** My history backup (the user key encrypted for the recovery key), or null. */
    backup: () =>
      request({
        method: 'GET',
        path: '/users/@me/e2ee/backup',
        data: z.object({ backup: keyBackupSchema.nullable() }),
      }),
    createBackup: (body: CreateKeyBackupRequest) =>
      request({
        method: 'PUT',
        path: '/users/@me/e2ee/backup',
        body,
        data: z.object({ backup: keyBackupSchema }),
      }),
    putBackupEntries: (body: UploadBackupEntriesRequest) =>
      request({ method: 'POST', path: '/users/@me/e2ee/backup/entries', body }),
    backupEntries: (query: ListBackupEntriesQuery) =>
      request({
        method: 'GET',
        path: `/users/@me/e2ee/backup/entries${queryString(query)}`,
        data: z.object({ entries: z.array(backupEntrySchema) }),
      }),
    /** Approving a new device from an approved one (see `DeviceApproval`). */
    approvals: {
      request: (body: { deviceId: Snowflake; commitment: string }) =>
        request({
          method: 'POST',
          path: '/users/@me/e2ee/approvals',
          body,
          data: approvalResult,
        }),
      get: (approvalId: Snowflake) =>
        request({
          method: 'GET',
          path: `/users/@me/e2ee/approvals/${id(approvalId)}`,
          data: approvalResult,
        }),
      accept: (approvalId: Snowflake, body: { deviceId: Snowflake; publicKey: string }) =>
        request({
          method: 'POST',
          path: `/users/@me/e2ee/approvals/${id(approvalId)}/accept`,
          body,
          data: approvalResult,
        }),
      reveal: (approvalId: Snowflake, publicKey: string) =>
        request({
          method: 'POST',
          path: `/users/@me/e2ee/approvals/${id(approvalId)}/reveal`,
          body: { publicKey },
          data: approvalResult,
        }),
      complete: (approvalId: Snowflake, secrets: string) =>
        request({
          method: 'POST',
          path: `/users/@me/e2ee/approvals/${id(approvalId)}/complete`,
          body: { secrets },
          data: approvalResult,
        }),
      decline: (approvalId: Snowflake) =>
        request({ method: 'DELETE', path: `/users/@me/e2ee/approvals/${id(approvalId)}` }),
    },
    /** Vouches for one of my devices with my user key. */
    signDevice: (deviceId: Snowflake, signature: string) =>
      request({
        method: 'PUT',
        path: `/users/@me/devices/${id(deviceId)}/signature`,
        body: { signature },
      }),
    uploadKeyPackages: (deviceId: Snowflake, body: UploadKeyPackagesRequest) =>
      request({ method: 'POST', path: `/users/@me/devices/${id(deviceId)}/key-packages`, body }),
    countKeyPackages: (deviceId: Snowflake) =>
      request({
        method: 'GET',
        path: `/users/@me/devices/${id(deviceId)}/key-packages/count`,
        data: z.object({ count: z.number().int() }),
      }),
    /** One key package of each of the user's devices, used up by the claim. */
    claimKeyPackages: (userId: Snowflake) =>
      request({
        method: 'POST',
        path: `/users/${id(userId)}/key-packages/claim`,
        data: z.object({ keyPackages: z.array(claimedKeyPackageSchema) }),
      }),
    /** Fails with STALE_EPOCH when another commit took that epoch first. */
    postCommit: (channelId: Snowflake, body: PostCommitRequest) =>
      request({ method: 'POST', path: `/channels/${id(channelId)}/e2ee/commits`, body }),
    handshakes: (channelId: Snowflake, query: ListHandshakesQuery) =>
      request({
        method: 'GET',
        path: `/channels/${id(channelId)}/e2ee/handshakes${queryString(query)}`,
        data: z.object({ handshakes: z.array(handshakeSchema) }),
      }),
  },
})
