import { QR_LOGIN_SECONDS } from '@chinchi/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useApi } from '../../lib/api-context'
import { createEphemeral } from '../e2ee/approval-crypto'
import { handRecoveryKey } from '../e2ee/handed-recovery'
import { openFromApprover } from './qr-login-crypto'
import { useSignedIn } from './use-auth-actions'

import type { Ephemeral } from '../e2ee/approval-crypto'
import type { ApiClient } from '@chinchi/sdk'
import type { QrLoginClaim } from '@chinchi/shared'

/** How often the new device asks whether it was let in. */
export const QR_POLL_MS = 2_000
/** A fresh QR a little before the old one expires, so a scan never lands on a dead one. */
const RENEW_MS = (QR_LOGIN_SECONDS - 10) * 1000

/** The key pair stays here: only its public half goes to the server and into the QR. */
const newTicket = async (api: ApiClient) => {
  const ephemeral: Ephemeral | null = await createEphemeral().catch(() => null)
  const { ticket } = await api.auth.qr.create(ephemeral ? { publicKey: ephemeral.publicKey } : {})
  return { ticket, ephemeral }
}

/**
 * The new device's side of signing in with a QR: shows a ticket, renews it, asks every couple
 * of seconds whether a signed-in device let it in, and then signs in, taking the recovery key
 * when the other device handed it over.
 */
export const useQrLogin = (redirectTo: string | undefined) => {
  const api = useApi()
  const signedIn = useSignedIn(redirectTo)
  const queryClient = useQueryClient()
  const pending = useQuery({
    queryKey: ['qrLoginTicket'],
    queryFn: () => newTicket(api),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    // Once opened on the other device, this QR stays: a fresh one would lose the number shown.
    refetchInterval: (query) =>
      queryClient.getQueryData<QrLoginClaim>(['qrLoginClaim', query.state.data?.ticket.id])
        ?.state === 'scanned'
        ? false
        : RENEW_MS,
  })
  const ticket = pending.data?.ticket
  const claim = useQuery({
    queryKey: ['qrLoginClaim', ticket?.id],
    queryFn: () => api.auth.qr.claim(ticket?.id ?? '', ticket?.secret ?? ''),
    enabled: ticket !== undefined,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.data?.state === 'approved' || query.state.error ? false : QR_POLL_MS,
  })

  // Expired, used up or a wrong number picked: start over with a new QR.
  const { refetch } = pending
  const claimFailed = claim.isError
  useEffect(() => {
    if (claimFailed) void refetch()
  }, [claimFailed, refetch])

  const match = claim.data?.state === 'scanned' ? claim.data.match : null

  const finished = useRef(false)
  const result = claim.data
  const ephemeral = pending.data?.ephemeral ?? null
  useEffect(() => {
    if (result?.state !== 'approved' || !ticket || finished.current) return
    finished.current = true
    void (async (approved: Extract<QrLoginClaim, { state: 'approved' }>) => {
      if (approved.sealed && approved.approverKey && ephemeral) {
        const recoveryKey = await openFromApprover(
          ticket.id,
          ephemeral,
          approved.approverKey,
          approved.sealed,
        )
        if (recoveryKey) handRecoveryKey(approved.user.id, recoveryKey)
      }
      await signedIn(approved)
    })(result)
  }, [result, ticket, ephemeral, signedIn])

  return {
    ticket,
    /** The number to pick on the other device, once it opened this sign-in. */
    match,
    error: pending.error,
    approved: result?.state === 'approved',
  }
}
