import { customStatusText, useCustomStatus } from './use-custom-status'

import type { Snowflake } from '@chinchi/shared'

/** One quiet line with someone's custom status, or nothing. */
export const CustomStatusLine = ({
  userId,
  className = '',
  wrap = false,
}: {
  userId: Snowflake
  className?: string
  /** Wraps onto more lines where there is room (a profile card) instead of being cut short. */
  wrap?: boolean
}) => {
  const status = useCustomStatus(userId)
  if (!status) return null
  const text = customStatusText(status)
  return (
    <span
      // Cut short in lists: the whole status shows on hover.
      title={wrap ? undefined : text}
      className={`block text-xs text-muted ${wrap ? 'break-words whitespace-normal' : 'truncate'} ${className}`}
    >
      {text}
    </span>
  )
}
