import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { verifyEd25519 } from './ed25519'

const pair = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')
  return { publicKey: raw.toString('base64'), privateKey }
}

describe('Ed25519 check', () => {
  it('accepts the signer, and nothing else', () => {
    const signer = pair()
    const signature = sign(null, Buffer.from('сообщение'), signer.privateKey).toString('base64')

    expect(verifyEd25519(signer.publicKey, 'сообщение', signature)).toBe(true)
    expect(verifyEd25519(signer.publicKey, 'другое', signature)).toBe(false)
    expect(verifyEd25519(pair().publicKey, 'сообщение', signature)).toBe(false)
    expect(verifyEd25519('AAAA', 'сообщение', signature)).toBe(false)
    expect(verifyEd25519(signer.publicKey, 'сообщение', 'AAAA')).toBe(false)
  })
})
