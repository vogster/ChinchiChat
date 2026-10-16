import { fromBase64, toBase64 } from './codec'

/**
 * 64 emoji easy to tell apart and to name aloud; six of them (36 bits) are what both devices
 * show for the user to compare. The commitment below gives a relay in the middle one guess at
 * matching them: one in 2^36.
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

const SAS_COUNT = 6
/** Bits of shared secret shown as emoji: SAS_COUNT groups of six. */
const SAS_BITS = SAS_COUNT * 6
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
    // v2: six emoji instead of four; devices on different versions show different emoji
    // rather than agreeing on a shorter code.
    'chinchi-approval-v2',
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
  const sas = new Uint8Array(await crypto.subtle.deriveBits(hkdf('sas'), base, SAS_BITS + 4))
  // Big-endian number from the derived bytes (fits a double exactly: well under 2^53).
  const bits = sas.reduce((value, byte) => value * 256 + byte, 0) / 2 ** (sas.length * 8 - SAS_BITS)
  const emoji = Array.from(
    { length: SAS_COUNT },
    (_, i) => SAS_EMOJI[Math.floor(bits / 2 ** (SAS_BITS - 6 * (i + 1))) % 64] as string,
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
