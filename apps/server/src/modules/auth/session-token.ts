import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32

export interface SessionToken {
  /** Sent to the client once; never stored. */
  readonly token: string
  /** Stored in the database; a leaked table cannot be used to impersonate users. */
  readonly tokenHash: string
}

export const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

export const generateSessionToken = (): SessionToken => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}
