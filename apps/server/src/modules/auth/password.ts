import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const argon2Async = promisify(argon2)

/** OWASP-recommended argon2id baseline: 19 MiB memory, 2 iterations, 1 lane. */
export const ARGON2_PARAMS = Object.freeze({
  memory: 19_456,
  passes: 2,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
})

const ARGON2_VERSION = 19
const PHC_PATTERN =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

interface ParsedHash {
  readonly version: number
  readonly memory: number
  readonly passes: number
  readonly parallelism: number
  readonly salt: Buffer
  readonly hash: Buffer
}

const toBase64 = (buffer: Buffer): string => buffer.toString('base64').replace(/=+$/, '')

const parseHash = (encoded: string): ParsedHash | null => {
  const match = PHC_PATTERN.exec(encoded)
  if (!match) return null
  const [, version, memory, passes, parallelism, salt, hash] = match
  return {
    version: Number(version),
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    salt: Buffer.from(salt as string, 'base64'),
    hash: Buffer.from(hash as string, 'base64'),
  }
}

const derive = (
  password: string,
  salt: Buffer,
  params: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> =>
  argon2Async('argon2id', {
    message: password,
    nonce: salt,
    memory: params.memory,
    passes: params.passes,
    parallelism: params.parallelism,
    tagLength: params.tagLength,
  })

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(ARGON2_PARAMS.saltLength)
  const hash = await derive(password, salt, ARGON2_PARAMS)
  const { memory, passes, parallelism } = ARGON2_PARAMS
  return `$argon2id$v=${ARGON2_VERSION}$m=${memory},t=${passes},p=${parallelism}$${toBase64(salt)}$${toBase64(hash)}`
}

/** Verifies using the parameters stored in the hash, so old hashes keep working after tuning. */
export const verifyPassword = async (encoded: string, password: string): Promise<boolean> => {
  const parsed = parseHash(encoded)
  if (!parsed || parsed.version !== ARGON2_VERSION || parsed.hash.length === 0) return false

  try {
    const candidate = await derive(password, parsed.salt, {
      memory: parsed.memory,
      passes: parsed.passes,
      parallelism: parsed.parallelism,
      tagLength: parsed.hash.length,
    })
    return timingSafeEqual(candidate, parsed.hash)
  } catch {
    return false
  }
}

export const needsRehash = (encoded: string): boolean => {
  const parsed = parseHash(encoded)
  return (
    !parsed ||
    parsed.version !== ARGON2_VERSION ||
    parsed.memory !== ARGON2_PARAMS.memory ||
    parsed.passes !== ARGON2_PARAMS.passes ||
    parsed.parallelism !== ARGON2_PARAMS.parallelism ||
    parsed.hash.length !== ARGON2_PARAMS.tagLength
  )
}
