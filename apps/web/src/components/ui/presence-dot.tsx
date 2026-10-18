import type { PresenceStatus } from '@chinchi/shared'

const COLORS: Readonly<Record<PresenceStatus, string>> = {
  online: 'bg-status-online',
  idle: 'bg-status-idle',
  dnd: 'bg-status-dnd',
  offline: 'bg-status-offline',
}

/** Status badge drawn over the bottom-right corner of an avatar. */
export const PresenceDot = ({ status, label }: { status: PresenceStatus; label: string }) => (
  <span
    role="img"
    aria-label={label}
    data-status={status}
    className={`absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-sidebar ${COLORS[status]}`}
  />
)
