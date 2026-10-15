import type { PresenceStatus } from '@chinchi/shared'

const COLORS: Readonly<Record<PresenceStatus, string>> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-500',
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
