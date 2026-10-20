import { useQuery } from '@tanstack/react-query'

import { useAnyE2eeClient } from './e2ee-context'

/** The code of a device by its public signature key (null until computed). */
export const useDeviceCode = (signaturePublicKey: string | null) => {
  const client = useAnyE2eeClient()
  const { data } = useQuery({
    queryKey: ['e2eeDeviceCode', signaturePublicKey],
    queryFn: () => client?.safety.deviceCode(signaturePublicKey as string) ?? null,
    enabled: client !== null && signaturePublicKey !== null,
    staleTime: Infinity,
  })
  return data ?? null
}

/** This device's own code (null until it is registered). */
export const useThisDeviceCode = () => {
  const client = useAnyE2eeClient()
  const { data } = useQuery({
    queryKey: ['e2eeThisDeviceCode'],
    queryFn: () => client?.safety.thisDeviceCode() ?? null,
    enabled: client !== null,
    staleTime: Infinity,
  })
  return data ?? null
}
