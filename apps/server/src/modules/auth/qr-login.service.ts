import { randomBytes, randomInt } from 'node:crypto'
import { QR_LOGIN_SECONDS, QR_MATCH_CHOICES } from '@chinchi/shared'

import { conflict, HttpError } from '../../http/http-error'
import { generateSessionToken, hashSessionToken } from './session-token'

import type { AuthResult, ClientInfo } from './auth.service'
import type { QrLogin, QrLoginStore } from './qr-login.store'
import type {
  ApproveQrLoginRequest,
  QrLoginInfo,
  QrLoginTicket,
  QrSignInEvent,
  Snowflake,
} from '@chinchi/shared'

/** Crockford base32: no I, L, O or U, so a code read aloud or typed is hard to get wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8
const USER_AGENT_MAX_LENGTH = 512

const unknownLogin = () =>
  new HttpError(404, 'UNKNOWN_QR_LOGIN', 'This sign-in code is unknown or has expired')
const mismatch = () =>
  new HttpError(403, 'QR_LOGIN_MISMATCH', 'That is not the number on the new device')

/** Distinct two-digit numbers in a random order; the new device shows one of them. */
const newChoices = () => {
  const picked = new Set<number>()
  while (picked.size < QR_MATCH_CHOICES) picked.add(randomInt(10, 100))
  const choices = [...picked]
  return { choices, match: choices[randomInt(QR_MATCH_CHOICES)] as number }
}

const newCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(32)]).join('')

const toInfo = (login: QrLogin): QrLoginInfo => ({
  id: login.id,
  userAgent: login.userAgent,
  ipAddress: login.ipAddress,
  createdAt: login.createdAt,
  publicKey: login.publicKey,
  choices: [...login.choices],
})

export interface QrLoginServiceDeps {
  readonly store: QrLoginStore
  /** Signs the user in on the device that claims (its user agent and address on the session). */
  readonly signInAs: (userId: Snowflake, client: ClientInfo) => Promise<AuthResult>
  /** The web address the QR points at (`PUBLIC_URL`). */
  readonly publicUrl: string
  /** After the new device got its session: tell the owner (best effort, never blocks it). */
  readonly onSignedIn?: (userId: Snowflake, event: QrSignInEvent) => Promise<void>
  readonly now?: () => Date
}

/**
 * Signing in on a new device from one already signed in: the new device shows a QR (or a short
 * code), the signed-in one approves it, and the new one claims its session with a secret only
 * it has. The approver may also seal the recovery key for the new device's key from the QR.
 */
export const createQrLoginService = ({
  store,
  signInAs,
  publicUrl,
  onSignedIn = async () => undefined,
  now = () => new Date(),
}: QrLoginServiceDeps) => {
  const waiting = async (id: string) => {
    const login = await store.find(id)
    if (!login) throw unknownLogin()
    return login
  }

  const opened = async (login: QrLogin) => {
    if (!login.seen) await store.update({ ...login, seen: true })
    return login
  }

  return {
    async create(publicKey: string | null, client: ClientInfo): Promise<QrLoginTicket> {
      const { token: secret, tokenHash: secretHash } = generateSessionToken()
      const created = now()
      const login: QrLogin = {
        id: randomBytes(16).toString('base64url'),
        code: newCode(),
        secretHash,
        publicKey,
        ...newChoices(),
        seen: false,
        userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ipAddress: client.ipAddress ?? null,
        createdAt: created.toISOString(),
        approvedBy: null,
        sealed: null,
        approverKey: null,
      }
      await store.create(login)
      const query = new URLSearchParams(
        publicKey ? { qr: login.id, qrKey: publicKey } : { qr: login.id },
      )
      return {
        id: login.id,
        secret,
        code: `${login.code.slice(0, 4)}-${login.code.slice(4)}`,
        url: `${publicUrl}/?${query.toString()}`,
        expiresAt: new Date(created.getTime() + QR_LOGIN_SECONDS * 1000).toISOString(),
      }
    },

    /** For the approver, who has it open now: the new device may show its number from here. */
    find: async (id: string) => toInfo(await opened(await waiting(id))),

    async findByCode(code: string) {
      const login = await store.findByCode(code)
      if (!login) throw unknownLogin()
      return toInfo(await opened(login))
    },

    async approve(id: string, userId: Snowflake, body: ApproveQrLoginRequest) {
      const login = await waiting(id)
      if (login.approvedBy) throw conflict('QR_LOGIN_USED', 'This sign-in was already approved')
      // One guess: a wrong number ends the sign-in, and the new device starts over.
      if (body.match !== login.match) {
        await store.delete(login)
        throw mismatch()
      }
      await store.update({
        ...login,
        approvedBy: userId,
        sealed: body.sealed ?? null,
        approverKey: body.approverKey ?? null,
      })
    },

    /**
     * Pending until the approver opens it, then the number to show; once approved, the session,
     * once (the ticket goes with it).
     */
    async claim(id: string, secret: string, client: ClientInfo) {
      const login = await store.find(id)
      if (!login || login.secretHash !== hashSessionToken(secret)) throw unknownLogin()
      if (!login.approvedBy) {
        return login.seen
          ? { state: 'scanned' as const, match: login.match }
          : { state: 'pending' as const }
      }
      await store.delete(login)
      const result = await signInAs(login.approvedBy, client)
      await onSignedIn(login.approvedBy, {
        qrLoginId: login.id,
        userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        ipAddress: client.ipAddress ?? null,
        createdAt: now().toISOString(),
      }).catch(() => undefined)
      return {
        state: 'approved' as const,
        result,
        sealed: login.sealed,
        approverKey: login.approverKey,
      }
    },
  }
}

export type QrLoginService = ReturnType<typeof createQrLoginService>
