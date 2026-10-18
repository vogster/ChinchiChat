import { useId } from 'react'

export interface SwitchProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly label: string
  readonly description?: string | undefined
  readonly disabled?: boolean
}

/** A labelled on/off toggle (role="switch"), with an optional hint under the label. */
export const Switch = ({ checked, onCheckedChange, label, description, disabled }: SwitchProps) => {
  const id = useId()
  return (
    <label
      className={`flex items-start justify-between gap-4 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span className="flex flex-col">
        <span id={`${id}-label`} className="font-medium">
          {label}
        </span>
        {description ? (
          <span id={`${id}-description`} className="text-sm text-muted">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${checked ? 'bg-secure' : 'bg-chip'}`}
      >
        <span
          aria-hidden
          className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </label>
  )
}
