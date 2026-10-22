const RADIUS = 15
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A ring that fills clockwise up to `percent`, exposed as a progressbar under `label`. */
export const ProgressRing = ({
  percent,
  label,
  className = 'size-8',
}: {
  percent: number
  label: string
  className?: string
}) => (
  <svg
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
    viewBox="0 0 36 36"
    className={`shrink-0 -rotate-90 ${className}`}
  >
    <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3.5" className="stroke-chip" />
    <circle
      cx="18"
      cy="18"
      r={RADIUS}
      fill="none"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeDasharray={CIRCUMFERENCE}
      strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
      className="stroke-accent transition-[stroke-dashoffset] duration-200 motion-reduce:transition-none"
    />
  </svg>
)
