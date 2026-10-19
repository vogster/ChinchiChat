import { saveTextFile } from '../../lib/save-file'

/** Hands the key over as a small text file, with a word on what it is for. */
export const downloadRecoveryKey = (key: string, note: string) =>
  saveTextFile('chinchi-recovery-key.txt', `${note}\n\n${key}\n`)
