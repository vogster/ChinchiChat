import { SNIFF_BYTES, detectImageType, stripMetadata } from '@chinchi/shared'

/**
 * A photo without its metadata (camera, location, comments), cut out without re-encoding — as
 * the server does for plain uploads, which it can't do for encrypted ones. Anything else, or a
 * photo that can't be parsed, goes as it is: only the conversation's members can open it.
 */
export const withoutMetadata = async (file: File): Promise<File> => {
  const data = new Uint8Array(await file.arrayBuffer())
  const type = detectImageType(data.subarray(0, SNIFF_BYTES))
  if (!type) return file
  try {
    const stripped = stripMetadata(data, type)
    return stripped
      ? new File([new Uint8Array(stripped)], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        })
      : file
  } catch {
    return file
  }
}
