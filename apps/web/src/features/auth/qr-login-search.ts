import { qrLoginIdSchema } from '@chinchi/shared'
import { z } from 'zod'

/**
 * A scanned sign-in QR opens the app at `/?qr=<id>&qrKey=<key>`: the approval opens over
 * whatever page is there. The key came through the camera, so it alone may receive encryption.
 */
export const qrLoginSearchSchema = z.object({
  qr: qrLoginIdSchema.optional().catch(undefined),
  qrKey: z.string().max(64).optional().catch(undefined),
})

export type QrLoginSearch = z.infer<typeof qrLoginSearchSchema>

/** Search params that open the approval of a sign-in (or with undefined close it). */
export const withQrLogin =
  (qr: string | undefined) =>
  (prev: Record<string, unknown>): never => {
    const { qr: _, qrKey: __, ...rest } = prev
    return (qr ? { ...rest, qr } : rest) as never
  }
