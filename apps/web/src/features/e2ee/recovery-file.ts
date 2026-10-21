import type { SaveFile } from '../shell/use-save-file'

/** Hands the key over as a small text file, with a word on what it is for. */
export const downloadRecoveryKey = (save: SaveFile, key: string, note: string) =>
  save('chinchi-recovery-key.txt', new Blob([`${note}\n\n${key}\n`], { type: 'text/plain' }))
