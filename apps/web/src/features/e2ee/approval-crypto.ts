import { fromBase64, toBase64 } from './codec'

/**
 * 64 emoji easy to tell apart and to name aloud; four of them (24 bits) are what both devices
 * show for the user to compare.
 */
export const SAS_EMOJI = [
  '🐶',
  '🐱',
  '🦁',
  '🐴',
  '🦄',
  '🐷',
  '🐘',
  '🐰',
  '🐼',
  '🐓',
  '🐧',
  '🐢',
  '🐟',
  '🐙',
  '🦋',
  '🌷',
  '🌳',
  '🌵',
  '🍄',
  '🌏',
  '🌙',
  '☁️',
  '🔥',
  '🍌',
  '🍎',
  '🍓',
  '🌽',
  '🍕',
  '🎂',
  '❤️',
  '😀',
  '🤖',
  '🎩',
  '👓',
  '🔧',
  '🎅',
  '👍',
  '☂️',
  '⌛',
  '⏰',
  '🎁',
  '💡',
  '📕',
  '✏️',
  '📎',
  '✂️',
  '🔒',
  '🔑',
  '🔨',
  '☎️',
  '🏁',
  '🚂',
  '🚲',
  '✈️',
  '🚀',
  '🏆',
  '⚽',
  '🎸',
  '🎺',
  '🔔',
  '⚓',
  '🎧',
  '📁',
  '📌',
] as const

const SAS_COUNT = 4
const IV_BYTES = 12
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** An ephemeral X25519 key pair for one approval; only its public half travels. */
export interface Ephemeral {
  readonly publicKey: string
  readonly privateKey: CryptoKey
}

export const createEphemeral = async (): Promise<Ephemeral> => {
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, false, [
    'deriveBits',
  ])) as CryptoKeyPair
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { publicKey: toBase64(raw), privateKey: pair.privateKey }
}

/** SHA-256 of the public key: sent first, so the key can't be chosen after seeing the other. */
export const commitmentOf = async (publicKey: string): Promise<string> =>
  toBase64(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(fromBase64(publicKey)))),
  )

/** Everything both sides agreed on; any difference gives different emoji and keys. */
export interface ApprovalTranscript {
  readonly approvalId: string
  readonly newDeviceId: string
  readonly approverDeviceId: string
  readonly newKey: string
  readonly approverKey: string
}

const transcriptOf = (t: ApprovalTranscript) =>
  [
    'chinchi-approval-v1',
    t.approvalId,
    t.newDeviceId,
    t.approverDeviceId,
    t.newKey,
    t.approverKey,
  ].join('|')

/** The emoji to compare and the key the secrets travel under, from the shared secret. */
export const agree = async (
  privateKey: CryptoKey,
  peerPublicKey: string,
  transcript: ApprovalTranscript,
): Promise<{ emoji: string[]; secretKey: CryptoKey }> => {
  const peer = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(fromBase64(peerPublicKey)),
    { name: 'X25519' },
    false,
    [],
  )
  const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: peer }, privateKey, 256)
  const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ])
  const info = transcriptOf(transcript)
  const hkdf = (label: string) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(),
    info: encoder.encode(`${label}|${info}`),
  })
  const sas = new Uint8Array(await crypto.subtle.deriveBits(hkdf('sas'), base, 24))
  const bits = ((sas[0] ?? 0) << 16) | ((sas[1] ?? 0) << 8) | (sas[2] ?? 0)
  const emoji = Array.from(
    { length: SAS_COUNT },
    (_, i) => SAS_EMOJI[(bits >>> (18 - i * 6)) & 63] as string,
  )
  const secretKey = await crypto.subtle.deriveKey(
    hkdf('secrets'),
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return { emoji, secretKey }
}

/** What the approver hands over: the recovery key, which opens the user key and history. */
export interface ApprovalSecrets {
  readonly recoveryKey: string
}

export const sealSecrets = async (key: CryptoKey, secrets: ApprovalSecrets): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(secrets)),
  )
  const out = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  out.set(iv)
  out.set(new Uint8Array(ciphertext), IV_BYTES)
  return toBase64(out)
}

export const openSecrets = async (
  key: CryptoKey,
  sealed: string,
): Promise<ApprovalSecrets | null> => {
  try {
    const bytes = fromBase64(sealed)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
      key,
      bytes.slice(IV_BYTES),
    )
    const value = JSON.parse(decoder.decode(plain)) as Partial<ApprovalSecrets>
    return typeof value.recoveryKey === 'string' ? { recoveryKey: value.recoveryKey } : null
  } catch {
    return null
  }
}
