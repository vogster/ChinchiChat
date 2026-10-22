import { z } from 'zod'

import { base64Schema } from '../e2ee/e2ee.schemas'
import { currentUserSchema } from '../users/user.schemas'

/** How long a QR sign-in waits to be scanned and approved. */
export const QR_LOGIN_SECONDS = 2 * 60

/** 32 bytes, base64: the new device's (or the approver's) ephemeral X25519 public key. */
const x25519Key = base64Schema(44).refine((value) => value.length === 44, 'Expected 32 bytes')

/** Opaque ids and secrets: base64url, as the server makes them. */
const opaque = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/, 'Not an id')

export const qrLoginIdSchema = opaque(16, 64)

/**
 * Once the approver opens the sign-in, the new device shows a two-digit number; the approver
 * picks it among this many. Approving then takes the new device's screen, not just a link: one
 * sent in a chat gets no number.
 */
export const QR_MATCH_CHOICES = 3
export const qrMatchSchema = z.number().int().min(10).max(99)

/**
 * The short code under the QR, for a device without a camera: 8 characters of Crockford
 * base32 ("KQ7M-2PXD"). Read case-insensitively, with or without the dash.
 */
export const qrLoginCodeSchema = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[^0-9A-Z]/g, ''))
  .refine((value) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(value), 'Not a sign-in code')

/** The new device asks for a sign-in; with its key, the approver can hand over encryption. */
export const createQrLoginRequestSchema = z.strictObject({
  publicKey: x25519Key.optional(),
})

/** What the new device keeps: the secret claims the session, the rest goes in the QR. */
export const qrLoginTicketSchema = z.object({
  id: qrLoginIdSchema,
  secret: opaque(32, 128),
  /** "KQ7M-2PXD" */
  code: z.string(),
  /** What the QR holds: the instance's web address that opens the approval, with the key. */
  url: z.url(),
  expiresAt: z.iso.datetime(),
})

/** What the approving device is shown before it says yes. */
export const qrLoginInfoSchema = z.object({
  id: qrLoginIdSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** The new device's key as the server has it (trust it only when it came in the QR). */
  publicKey: x25519Key.nullable(),
  /** The number on the new device among others, in an order fixed for this sign-in. */
  choices: z.array(qrMatchSchema).length(QR_MATCH_CHOICES),
})

/**
 * Yes, with the number the new device shows (a wrong one ends the sign-in), and the recovery
 * key sealed for the new device when encryption is handed over.
 */
export const approveQrLoginRequestSchema = z
  .strictObject({
    match: qrMatchSchema,
    sealed: base64Schema(4096).optional(),
    approverKey: x25519Key.optional(),
  })
  .refine(
    (body) => (body.sealed === undefined) === (body.approverKey === undefined),
    'The sealed secrets and the approver key go together',
  )

export const claimQrLoginRequestSchema = z.strictObject({ secret: opaque(32, 128) })

/**
 * Still waiting; opened by the approver (the new device shows the number to pick); or signed in
 * (with the sealed secrets when encryption was handed over).
 */
export const qrLoginClaimSchema = z.union([
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('scanned'), match: qrMatchSchema }),
  z.object({
    state: z.literal('approved'),
    user: currentUserSchema,
    /** Only in bearer mode, for native clients. */
    token: z.string().optional(),
    sealed: z.string().nullable(),
    approverKey: z.string().nullable(),
  }),
])

/**
 * Someone signed in to the account by a QR (to all of its open sessions): the one that
 * approved it knows the id and stays quiet, the others ask "was it you?".
 */
export const qrSignInEventSchema = z.object({
  qrLoginId: qrLoginIdSchema,
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export type QrSignInEvent = z.infer<typeof qrSignInEventSchema>
export type CreateQrLoginRequest = z.infer<typeof createQrLoginRequestSchema>
export type QrLoginTicket = z.infer<typeof qrLoginTicketSchema>
export type QrLoginInfo = z.infer<typeof qrLoginInfoSchema>
export type ApproveQrLoginRequest = z.infer<typeof approveQrLoginRequestSchema>
export type QrLoginClaim = z.infer<typeof qrLoginClaimSchema>
