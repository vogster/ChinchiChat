import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useApi } from '../../lib/api-context'
import { authKeys } from '../auth/queries'

import type { CurrentUser, MfaConfirmRequest } from '@chinchi/shared'

/** Setting up, renewing and turning off two-factor sign-in; keeps `me` in step. */
export const useMfaActions = () => {
  const api = useApi()
  const queryClient = useQueryClient()
  const markEnabled = (mfaEnabled: boolean) =>
    queryClient.setQueryData<CurrentUser | null>(authKeys.me, (me) =>
      me ? { ...me, mfaEnabled } : me,
    )
  return {
    setup: useMutation({ mutationFn: (password: string) => api.mfa.setup(password) }),
    enable: useMutation({
      mutationFn: (code: string) => api.mfa.enable(code),
      onSuccess: () => markEnabled(true),
    }),
    renew: useMutation({
      mutationFn: (body: MfaConfirmRequest) => api.mfa.renewRecoveryCodes(body),
    }),
    disable: useMutation({
      mutationFn: (body: MfaConfirmRequest) => api.mfa.disable(body),
      onSuccess: () => markEnabled(false),
    }),
  }
}
