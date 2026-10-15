import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const INVITE_CODE_LENGTH = 8

/** 8 base62 characters ≈ 47 bits: short enough to share, too many to enumerate. */
export const generateInviteCode = (): string =>
  Array.from({ length: INVITE_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
