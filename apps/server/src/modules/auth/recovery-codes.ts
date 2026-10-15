import { createHash, randomBytes } from 'node:crypto'

import { RECOVERY_CODE_COUNT } from '@chinchi/shared'

import { base32Encode } from './totp'

/** Ten codes of 50 random bits each, written "abcde-fghij". */
export const generateRecoveryCodes = (): string[] =>
  Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const letters = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase()
    return `${letters.slice(0, 5)}-${letters.slice(5)}`
  })

/** The codes are random enough that a fast hash is safe (unlike passwords). */
export const hashRecoveryCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex')
