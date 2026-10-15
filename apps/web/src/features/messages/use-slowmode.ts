import { Permission } from '@chinchi/shared'
import { useEffect, useState } from 'react'

import { can } from '../permissions/permissions'

import type { Channel } from '@chinchi/shared'

export interface SlowmodeState {
  /** Seconds between messages, or 0 when slowmode doesn't apply to this member. */
  readonly seconds: number
  /** Whole seconds until the next message may go; 0 when it may go now. */
  readonly wait: number
  /** Call after sending: starts the wait. */
  readonly sent: () => void
}

/** Slowmode as this member experiences it; moderators aren't held back (as on the server). */
export const useSlowmode = (channel: Channel, permissions: bigint): SlowmodeState => {
  const bypass =
    can(permissions, Permission.ManageMessages) || can(permissions, Permission.ManageChannels)
  const seconds = bypass ? 0 : channel.rateLimitPerUser
  const [until, setUntil] = useState(0)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (until === 0) return
    const tick = () => setWait(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [until])

  return {
    seconds,
    wait: seconds > 0 ? wait : 0,
    sent: () => {
      if (seconds > 0) setUntil(Date.now() + seconds * 1000)
    },
  }
}
