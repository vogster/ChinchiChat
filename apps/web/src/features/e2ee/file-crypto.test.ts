import { describe, expect, it } from 'vitest'

import { decryptFile, encryptFile } from './file-crypto'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())

describe('file encryption', () => {
  it('turns a file into ciphertext that only its key opens', async () => {
    const file = new File([PNG], 'кот.png', { type: 'image/png' })

    const { blob, file: described } = await encryptFile(file)
    const ciphertext = await bytesOf(blob)

    expect(described).toMatchObject({ name: 'кот.png', type: 'image/png', size: PNG.length })
    // AES-GCM adds a 16-byte tag; the bytes look nothing like the file.
    expect(ciphertext).toHaveLength(PNG.length + 16)
    expect(ciphertext.slice(0, 8)).not.toEqual(PNG.slice(0, 8))
    expect(await decryptFile(ciphertext, described)).toEqual(PNG)
  })

  it('uses a fresh key for every file', async () => {
    const a = await encryptFile(new File([PNG], 'a.png'))
    const b = await encryptFile(new File([PNG], 'b.png'))

    expect(a.file.key).not.toBe(b.file.key)
    expect(await bytesOf(a.blob)).not.toEqual(await bytesOf(b.blob))
  })

  it('refuses ciphertext that was changed or a wrong key', async () => {
    const { blob, file } = await encryptFile(new File([PNG], 'a.png'))
    const tampered = await bytesOf(blob)
    tampered[0] = (tampered[0] ?? 0) ^ 1
    const other = await encryptFile(new File([PNG], 'b.png'))

    await expect(decryptFile(tampered, file)).rejects.toBeDefined()
    await expect(decryptFile(await bytesOf(blob), other.file)).rejects.toBeDefined()
  })
})
