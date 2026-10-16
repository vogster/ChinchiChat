/** Hands the key over as a small text file, with a word on what it is for. */
export const downloadRecoveryKey = (key: string, note: string) => {
  const url = URL.createObjectURL(new Blob([`${note}\n\n${key}\n`], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'chinchi-recovery-key.txt'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
