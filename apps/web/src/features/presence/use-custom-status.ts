import { useQuery } from '@tanstack/react-query'
import { isCustomStatusActive } from '@chinchi/shared'

import { useMinuteClock } from '../../lib/use-minute-clock'
import { customStatusesQueryOptions } from './queries'

import type { CustomStatus, Snowflake } from '@chinchi/shared'

/** Someone's custom status while it lasts; null when none or it has ended. */
export const useCustomStatus = (userId: Snowflake | undefined): CustomStatus | null => {
  const statuses = useQuery(customStatusesQueryOptions()).data ?? {}
  const now = useMinuteClock()
  const status = userId ? statuses[userId] : undefined
  return status && isCustomStatusActive(status, now) ? status : null
}

/** "🍜 Обедаю", "🍜" or "Обедаю". */
export const customStatusText = (status: CustomStatus) =>
  [status.emoji, status.text].filter(Boolean).join(' ')
