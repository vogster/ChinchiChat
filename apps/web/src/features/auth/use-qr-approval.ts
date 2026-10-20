import { useMutation, useQuery } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { useAnyE2eeClient } from '../e2ee/e2ee-context'
import { sealForNewDevice } from './qr-login-crypto'

/**
 * The approving device's side: who asks to sign in, and yes, with the recovery key sealed for
 * the new device when its key came in the QR and matches what the server holds.
 */
export const useQrApproval = (id: string, scannedKey: string | undefined) => {
  const api = useApi()
  const e2ee = useAnyE2eeClient()
  const login = useQuery({
    queryKey: ['qrLogin', id],
    queryFn: async () => (await api.auth.qr.find(id)).login,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const recoveryKey = useQuery({
    queryKey: ['qrLoginRecovery', id],
    queryFn: async () => (await e2ee?.recovery.key().catch(() => null)) ?? null,
    gcTime: 0,
  })
  const newKey = login.data?.publicKey
  const canHandOver = Boolean(scannedKey && newKey === scannedKey && recoveryKey.data)
  const approve = useMutation({
    mutationFn: async (handOver: boolean) => {
      const sealed =
        handOver && canHandOver && scannedKey && recoveryKey.data
          ? await sealForNewDevice(id, scannedKey, recoveryKey.data)
          : {}
      await api.auth.qr.approve(id, sealed)
    },
  })
  return { login, canHandOver, approve }
}
