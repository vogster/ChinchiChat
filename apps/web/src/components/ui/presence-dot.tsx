import type { PresenceStatus } from '@chinchi/shared'

const COLORS: Readonly<Record<PresenceStatus, string>> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
  offline: 'bg-status-offline',
}

/** Status badge drawn over the bottom-right corner of an avatar. */
export const PresenceDot = ({
  status,
  label,
  border = 'border-side',
}: {
  status: PresenceStatus
  label: string
  /** The colour behind the avatar, so the dot looks cut out of it. */
  border?: string
}) => (
  <span
    role="img"
    aria-label={label}
    data-status={status}
    className={`absolute -right-[3px] -bottom-[3px] size-[13px] rounded-full border-[3px] ${border} ${COLORS[status]}`}
  />
)
