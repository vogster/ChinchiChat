/** Hands bytes over as a file the browser saves under the given name. */
export const saveBlob = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Give the browser time to start the download before letting go of the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Text as a file (a recovery key, recovery codes). */
export const saveTextFile = (fileName: string, text: string) =>
  saveBlob(fileName, new Blob([text], { type: 'text/plain' }))
