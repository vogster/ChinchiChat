/** RFC 5987 value: encodeURIComponent leaves `'()*` alone, but they are not attr-chars. */
const encodeRfc5987 = (value: string) =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )

/**
 * `Content-Disposition` with an ASCII fallback name for old clients and the exact UTF-8 name
 * (RFC 6266) for everyone else.
 */
export const contentDisposition = (filename: string, inline: boolean): string => {
  const fallback = filename.replace(/(?:[^\x20-\x7e]|["\\%])+/g, '_')
  const type = inline ? 'inline' : 'attachment'
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`
}
