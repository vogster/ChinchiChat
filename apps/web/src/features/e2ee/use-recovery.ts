import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useCurrentUser } from '../auth/use-auth-actions'
import { useAnyE2eeClient } from './e2ee-context'

import type { UseKeyResult } from './history-backup'

const recoveryKey = ['e2eeRecovery'] as const
const SNOOZED = 'chinchi.recovery.later'

/** "Later" holds until the tab closes: no reminder on every conversation in between. */
export const snoozeRecoveryReminder = () => {
  try {
    sessionStorage.setItem(SNOOZED, '1')
  } catch {
    // Storage blocked: the reminder comes back on the next conversation.
  }
}

export const recoveryReminderSnoozed = () => {
  try {
    return sessionStorage.getItem(SNOOZED) === '1'
  } catch {
    return false
  }
}

/**
 * The recovery key as this device knows it: the key itself on a device that holds it (null
 * elsewhere), and whether the user said they saved it.
 */
export const useRecovery = (enabled = true) => {
  const client = useAnyE2eeClient()
  const queryClient = useQueryClient()
  const userId = useCurrentUser()?.id
  const { data } = useQuery({
    queryKey: [...recoveryKey, userId],
    queryFn: async () => {
      const recovery = client?.recovery
      if (!recovery) return { key: null, saved: true }
      const [key, saved] = await Promise.all([recovery.key(), recovery.saved()])
      return { key, saved }
    },
    enabled: enabled && client !== null,
  })
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: recoveryKey }),
    [queryClient],
  )

  return {
    loaded: data !== undefined,
    refresh,
    key: data?.key ?? null,
    saved: data?.saved ?? true,
    markSaved: async () => {
      await client?.recovery.markSaved()
      await refresh()
    },
    useKey: async (text: string): Promise<UseKeyResult> => {
      const result = (await client?.recovery.useKey(text)) ?? 'wrong'
      if (result === 'ok') await refresh()
      return result
    },
  }
}

export type RecoveryControls = ReturnType<typeof useRecovery>
