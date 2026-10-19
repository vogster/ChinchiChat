import type { UploadProgress } from '@chinchi/sdk'

/**
 * One progress for several files sent one after another: each file's own progress, scaled to
 * its size, on top of the files already sent. The sizes are the files as picked (an encrypted
 * copy is a little larger, so its own total is used only as a fraction).
 */
export const overallProgress =
  (files: readonly Blob[], report: UploadProgress) =>
  (index: number): UploadProgress => {
    const total = files.reduce((sum, file) => sum + file.size, 0)
    const before = files.slice(0, index).reduce((sum, file) => sum + file.size, 0)
    const size = files[index]?.size ?? 0
    return (sent, of) => report(before + (of > 0 ? (size * sent) / of : size), total)
  }
