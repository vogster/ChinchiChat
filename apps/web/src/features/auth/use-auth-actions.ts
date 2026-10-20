import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { useApi } from '../../lib/api-context'
import { useAnyE2eeClient } from '../e2ee/e2ee-context'
import { authKeys, meQueryOptions } from './queries'
import { safeRedirect } from './redirect'

import type { LoginRequest, MfaLoginRequest, RegisterRequest } from '@chinchi/shared'

export const useCurrentUser = () => useQuery(meQueryOptions(useApi())).data ?? null

/** Shared success path for login and registration: cache the user, go where they were headed. */
export const useSignedIn = (redirectTo?: string) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async ({ user }: { user: NonNullable<ReturnType<typeof useCurrentUser>> }) => {
    queryClient.setQueryData(authKeys.me, user)
    await navigate({ href: safeRedirect(redirectTo) })
  }
}

/** Signs in, or hands the second step's ticket to `onMfa` for accounts with 2FA. */
export const useLogin = (redirectTo: string | undefined, onMfa: (ticket: string) => void) => {
  const api = useApi()
  const signedIn = useSignedIn(redirectTo)
  return useMutation({
    mutationFn: (values: LoginRequest) => api.auth.login(values),
    onSuccess: (result) => ('mfaTicket' in result ? onMfa(result.mfaTicket) : signedIn(result)),
  })
}

export const useLoginMfa = (redirectTo?: string) => {
  const api = useApi()
  return useMutation({
    mutationFn: (values: MfaLoginRequest) => api.auth.loginMfa(values),
    onSuccess: useSignedIn(redirectTo),
  })
}

export const useRegister = (redirectTo?: string) => {
  const api = useApi()
  return useMutation({
    mutationFn: (values: RegisterRequest) => api.auth.register(values),
    onSuccess: useSignedIn(redirectTo),
  })
}

export const useLogout = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const e2ee = useAnyE2eeClient()
  return useMutation({
    // Encryption first, while the session still works: this device leaves its conversations
    // and its keys and decrypted messages are wiped from the browser.
    mutationFn: async () => {
      await e2ee?.forget().catch(() => undefined)
      await api.auth.logout()
    },
    // Even if the server call fails (e.g. session already gone), the user wants to be signed out.
    onSettled: async () => {
      queryClient.clear()
      queryClient.setQueryData(authKeys.me, null)
      await navigate({ to: '/login' })
    },
  })
}

export const useResendVerification = () => {
  const api = useApi()
  return useMutation({ mutationFn: () => api.auth.resendVerification() })
}
