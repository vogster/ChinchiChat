import { useSyncExternalStore } from 'react'

import { useE2ee } from './e2ee-context'

import type { ApprovalView } from './device-approval'

const none: ApprovalView[] = []
const nothing = () => () => undefined

/** The approvals this device takes part in, as their screens should show them. */
export const useApprovals = () => {
  const { client } = useE2ee()
  const views = useSyncExternalStore(
    client?.approvals.subscribe ?? nothing,
    client ? client.approvals.views : () => none,
  )
  return { views, approvals: client?.approvals ?? null }
}
