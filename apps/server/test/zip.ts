import { inflateRawSync } from 'node:zlib'

/**
 * Reads a ZIP archive into name → bytes (stored or deflated entries, no zip64): enough to check
 * what the server put in one.
 */
export const readZip = (archive: Buffer): Map<string, Buffer> => {
  // End of central directory: the last record, signature 0x06054b50.
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('Not a ZIP archive')
  const count = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  const files = new Map<string, Buffer>()
  for (let i = 0; i < count; i += 1) {
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localName = archive.readUInt16LE(localOffset + 26)
    const localExtra = archive.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localName + localExtra
    const data = archive.subarray(start, start + compressedSize)
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}
