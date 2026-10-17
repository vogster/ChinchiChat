/** Hands text over as a file the browser saves (a recovery key, recovery codes). */
export const saveTextFile = (fileName: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  // Give the browser time to start the download before letting go of the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
