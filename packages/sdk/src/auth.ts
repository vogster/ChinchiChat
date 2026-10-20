import {
  currentUserSchema,
  customStatusSchema,
  instanceInfoSchema,
  loginResultSchema,
  qrLoginClaimSchema,
  qrLoginInfoSchema,
  qrLoginTicketSchema,
  recoveryCodesSchema,
  sessionInfoSchema,
  totpSetupSchema,
  userProfileSchema,
} from '@chinchi/shared'
import { z } from 'zod'

import { id } from './url'

import type { Http } from './http'
import type {
  ApproveQrLoginRequest,
  ChangePasswordRequest,
  CreateQrLoginRequest,
  LoginRequest,
  MfaConfirmRequest,
  MfaLoginRequest,
  RegisterRequest,
  SetCustomStatusRequest,
  Snowflake,
  UpdateProfileRequest,
} from '@chinchi/shared'

const authResult = z.object({ user: currentUserSchema, token: z.string().optional() })
const userResult = z.object({ user: currentUserSchema })
const nothing = z.null()
const qrTicketResult = z.object({ ticket: qrLoginTicketSchema })
const qrInfoResult = z.object({ login: qrLoginInfoSchema })

/** Accounts: signing up and in, two-factor, sessions, the profile, the instance. */
export const createAuthApi = (request: Http) => ({
  auth: {
    register: (body: RegisterRequest) =>
      request({ method: 'POST', path: '/auth/register', body, data: authResult }),
    /** Either signs in, or returns `mfaTicket` for `loginMfa` (2FA accounts). */
    login: (body: LoginRequest) =>
      request({ method: 'POST', path: '/auth/login', body, data: loginResultSchema }),
    loginMfa: (body: MfaLoginRequest) =>
      request({ method: 'POST', path: '/auth/login/mfa', body, data: authResult }),
    logout: () => request({ method: 'POST', path: '/auth/logout' }),
    verifyEmail: (token: string) =>
      request({ method: 'POST', path: '/auth/verify-email', body: { token }, data: userResult }),
    resendVerification: () =>
      request({ method: 'POST', path: '/auth/verify-email/resend', data: nothing }),
    forgotPassword: (email: string) =>
      request({ method: 'POST', path: '/auth/password/forgot', body: { email }, data: nothing }),
    changePassword: (body: ChangePasswordRequest) =>
      request({ method: 'POST', path: '/auth/password/change', body, data: nothing }),
    resetPassword: (token: string, password: string) =>
      request({
        method: 'POST',
        path: '/auth/password/reset',
        body: { token, password },
        data: nothing,
      }),
    /** Signing in from a signed-in device: the new one asks, the signed-in one approves. */
    qr: {
      create: (body: CreateQrLoginRequest) =>
        request({ method: 'POST', path: '/auth/qr', body, data: qrTicketResult }),
      find: (id: string) =>
        request({ method: 'GET', path: `/auth/qr/${encodeURIComponent(id)}`, data: qrInfoResult }),
      findByCode: (code: string) =>
        request({
          method: 'GET',
          path: `/auth/qr/code/${encodeURIComponent(code)}`,
          data: qrInfoResult,
        }),
      approve: (id: string, body: ApproveQrLoginRequest) =>
        request({ method: 'POST', path: `/auth/qr/${encodeURIComponent(id)}/approve`, body }),
      /** Waiting, or signed in (cookie, or `token` in bearer mode). */
      claim: (id: string, secret: string) =>
        request({
          method: 'POST',
          path: `/auth/qr/${encodeURIComponent(id)}/claim`,
          body: { secret },
          data: qrLoginClaimSchema,
        }),
    },
  },
  mfa: {
    setup: (password: string) =>
      request({
        method: 'POST',
        path: '/users/@me/mfa/totp/setup',
        body: { password },
        data: totpSetupSchema,
      }),
    /** Confirms the app with a code; the recovery codes come back only now. */
    enable: (code: string) =>
      request({
        method: 'POST',
        path: '/users/@me/mfa/totp/enable',
        body: { code },
        data: recoveryCodesSchema,
      }),
    disable: (body: MfaConfirmRequest) =>
      request({ method: 'POST', path: '/users/@me/mfa/disable', body, data: nothing }),
    renewRecoveryCodes: (body: MfaConfirmRequest) =>
      request({
        method: 'POST',
        path: '/users/@me/mfa/recovery-codes',
        body,
        data: recoveryCodesSchema,
      }),
  },
  sessions: {
    list: () =>
      request({
        method: 'GET',
        path: '/auth/sessions',
        data: z.object({ sessions: z.array(sessionInfoSchema) }),
      }),
    revoke: (sessionId: Snowflake) =>
      request({ method: 'DELETE', path: `/auth/sessions/${id(sessionId)}` }),
    revokeOthers: () => request({ method: 'DELETE', path: '/auth/sessions' }),
  },
  users: {
    me: () => request({ method: 'GET', path: '/users/@me', data: userResult }),
    updateMe: (body: UpdateProfileRequest) =>
      request({ method: 'PATCH', path: '/users/@me', body, data: userResult }),
    /** Deletes the signed-in account for good; messages stay as a deleted user's. */
    deleteMe: (password: string, code?: string) =>
      request({
        method: 'DELETE',
        path: '/users/@me',
        body: { password, ...(code ? { code } : {}) },
      }),
    /** PNG, JPEG, GIF or WebP up to PROFILE_IMAGE_MAX_BYTES; stored as a square crop. */
    setAvatar: (image: Blob) =>
      request({ method: 'PUT', path: '/users/@me/avatar', body: image, data: userResult }),
    clearAvatar: () => request({ method: 'DELETE', path: '/users/@me/avatar', data: userResult }),
    /** Same formats as avatars; stored as a wide 3:1 strip. */
    setBanner: (image: Blob) =>
      request({ method: 'PUT', path: '/users/@me/banner', body: image, data: userResult }),
    clearBanner: () => request({ method: 'DELETE', path: '/users/@me/banner', data: userResult }),
    /** A line under my name, shown to others while I am not invisible. */
    setCustomStatus: (body: SetCustomStatusRequest) =>
      request({
        method: 'PUT',
        path: '/users/@me/custom-status',
        body,
        data: z.object({ customStatus: customStatusSchema }),
      }),
    clearCustomStatus: () => request({ method: 'DELETE', path: '/users/@me/custom-status' }),
    /** Someone's profile; `guildId` adds their membership in that server (roles, nickname). */
    profile: (userId: Snowflake, guildId?: Snowflake) =>
      request({
        method: 'GET',
        path: `/users/${id(userId)}/profile${guildId ? `?guildId=${id(guildId)}` : ''}`,
        data: z.object({ profile: userProfileSchema }),
      }),
  },
  instance: {
    get: () =>
      request({
        method: 'GET',
        path: '/instance',
        data: z.object({ instance: instanceInfoSchema }),
      }),
  },
})
